import 'dotenv/config';
import {
    Keypair,
    Commitment,
    Connection,
    PublicKey,
    ComputeBudgetProgram,
    BlockhashWithExpiryBlockHeight,
    TransactionInstruction
} from '@solana/web3.js';
import BN from 'bn.js';
import {Wallet} from '@coral-xyz/anchor';
import Log from "@solpkr/log";
import chalk from "@solpkr/log/lib/chalk";
import OpenBookCrank from "./OpenBookCrank";
import {sleep, getKeyPair, config, generateMessageV0Transaction} from "./utils";
import Args from "@solpkr/args";
import Influx from "@solpkr/influx";

export const DEFAULTS = {
    INTERVAL: 1000,
    WALLET_PATH: '~/openbook-v2/ts/client/src/wallet.json',
    RPC_URL: 'https://api.mainnet-beta.solana.com',
    CONSUME_EVENTS_LIMIT: 19,
    MARKETS: 'AFgkED1FUVfBe2trPUDqSqK9QKd4stJrfzq5q1RwAFTa',
    PRIORITY_MARKETS: '',
    PROGRAM_ID: 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb',
    MIN_EVENTS: 1,
    MAX_TX_INSTRUCTIONS: 1,
    CU_PRICE: 1,
    PRIORITY_CU_LIMIT: 50000,
    PRIORITY_QUEUE_LIMIT: 100,
    PRIORITY_CU_PRICE: 100000,
    DEBUG: true
} as any;

const RPC_URL: string = config('RPC_URL');
const WALLET_PATH: string = config('WALLET_PATH');
const KEYPAIR: string = getKeyPair(WALLET_PATH);
const MARKETS: string = config('MARKETS');
const PRIORITY_MARKETS: string = config('PRIORITY_MARKETS');
const MAX_TX_INSTRUCTIONS: number = parseInt(config('MAX_TX_INSTRUCTIONS'))
const MIN_EVENTS: number = parseInt(config('MIN_EVENTS'));
const PRIORITY_QUEUE_LIMIT: number = parseInt(config('PRIORITY_QUEUE_LIMIT'));
const PRIORITY_CU_PRICE: number = parseInt(config('PRIORITY_CU_PRICE'));
const INTERVAL: number = parseInt(config('INTERVAL'));
const CU_PRICE: number = parseInt(config('CU_PRICE'));
const PRIORITY_CU_LIMIT: number = parseInt(config('PRIORITY_CU_LIMIT'));
const CONSUME_EVENTS_LIMIT: BN = new BN(config('CONSUME_EVENTS_LIMIT'));
const PROGRAM_ID: PublicKey = new PublicKey(config('PROGRAM_ID'));
const DEBUG: boolean = Boolean(parseInt(config('DEBUG')));
const args = Args.load();

let influx: null | Influx;
if (args.get('influxdb-host', false)) {
    influx = new Influx(
        args.get('influxdb-host', '127.0.0.1'),
        args.get('influxdb-database', 'ob2crank'),
    );
}

(async () => {
    let minContextSlot = 0;

    const connection = new Connection(RPC_URL, 'processed' as Commitment);
    const wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(KEYPAIR))));
    const marketPks = MARKETS.split(',').map((m: string) => new PublicKey(m));
    const priorityMarketPks = PRIORITY_MARKETS.split(',').map((m: string) => new PublicKey(m));
    const openBookCrank = new OpenBookCrank(connection, wallet, PROGRAM_ID);
    await openBookCrank.loadMarkets(marketPks);

    let recentBlockhash: BlockhashWithExpiryBlockHeight = await connection.getLatestBlockhash('finalized');
    setInterval(() => {
        connection.getLatestBlockhash('finalized')
            .then(hash => recentBlockhash = hash)
            .catch(e => Log.error(`Couldn't get blockhash: ${e.message}`))
    }, 1000);

    if (DEBUG) Log.info('DEBUG ENABLED');
    Log.info('Starting OpenBook v2 Cranker');
    Log.info(`Loaded RPC_URL: ${RPC_URL}`);
    Log.info(`Loaded Wallet: ${wallet.payer.publicKey.toString()} from ${WALLET_PATH}`);
    Log.info(`Loaded MARKETS: ${MARKETS}`);
    Log.info(`Loaded first blockhash: ${recentBlockhash.blockhash}`);

    const doCrank = async function () {
        let instructionBumpMap: Map<TransactionInstruction, number> = new Map();

        //get the event heap accounts and ensure we have not already processed this slot.
        const eventHeapAccounts = await openBookCrank.getHeapAccounts();
        const contextSlot = eventHeapAccounts[0]!.context.slot;
        if (contextSlot < minContextSlot) {
            if (DEBUG) Log.info(`already processed slot ${contextSlot}, skipping...`);
            return;
        }
        minContextSlot = contextSlot + 1;

        let crankInstructions = [];
        let influxPoints = [];

        for (const heapAccount of eventHeapAccounts.filter(Boolean)) {
            if(!heapAccount) throw new Error('Invalid Heap Account');

            const index = eventHeapAccounts.indexOf(heapAccount);
            const heapSize = heapAccount.data.header.count
            const marketAddress: PublicKey = marketPks[index];

            influxPoints.push({
                measurement: 'ob2-crank-queue',
                tags: {
                    address: marketAddress.toString(),
                },
                fields: {
                    size: heapSize,
                }
            });
1
            if(args.get('queue-only', false)) continue; //don't crank if --queue-only is passed

            if (!heapAccount) continue;
            if (heapSize < MIN_EVENTS) continue;

            const {
                remainingAccounts,
                consumeEventsIx
            } = await openBookCrank.getEventsConsumeIx(marketAddress, CONSUME_EVENTS_LIMIT);

            if (heapSize > PRIORITY_QUEUE_LIMIT) instructionBumpMap.set(consumeEventsIx, 1);
            if (priorityMarketPks.some(pk => pk.equals(marketAddress))) instructionBumpMap.set(consumeEventsIx, 1);

            crankInstructions.push(consumeEventsIx);

            Log.info(
                `Market: ${marketPks[index]}' ` +
                `Creating consume events for ${heapSize} events ` +
                `Involving ${remainingAccounts.length} accounts.`
            );
        }

        if (influx && influxPoints.length) {
            influx.insertBatchData(influxPoints).catch((error: any) => Log.error(error.message));
        }

        //send each transaction until crankInstructions are empty
        while (crankInstructions.length > 0) {

            let instructions: TransactionInstruction[] = [];
            let numInstructionsAdded = 0;
            let shouldBumpFee = false;

            for (const crankInstruction of crankInstructions) {
                if (numInstructionsAdded >= MAX_TX_INSTRUCTIONS) break;

                //check if we would exceed the max transaction size (safe estimate of 25 accounts)
                if (new Set([
                    ...instructions.flatMap(instr => instr.keys.map(key => key.pubkey.toString())),
                    ...crankInstruction.keys.map(key => key.pubkey.toString())
                ]).size > 25) {
                    Log.warn('Adding the instruction would exceed limit for number of accounts');
                    break;
                }

                if (instructionBumpMap.has(crankInstruction)) shouldBumpFee = true;
                instructions.push(crankInstruction);
                numInstructionsAdded++;
            }

            //remove the added instructions from crankInstructions
            crankInstructions = crankInstructions.filter(crankInstruction =>
                !instructions.includes(crankInstruction)
            );

            if (!(instructions.length > 0)) throw new Error('Instructions are empty!');

            instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({
                units: PRIORITY_CU_LIMIT * instructions.length,
            }));

            //add the fee on either CU_PRICE or PRIORITY_CU_PRICE depending on shouldBumpFee
            instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: shouldBumpFee ? PRIORITY_CU_PRICE : CU_PRICE,
            }));

            const transaction = generateMessageV0Transaction(recentBlockhash.blockhash, instructions, wallet.payer);
            const txId = await connection.sendRawTransaction(transaction.serialize(), {skipPreflight: true});
            Log.info(chalk.cyan(`Cranked ${numInstructionsAdded} market(s): ${txId}`));

        }

    }

    //run in a loop,log any errors but don't throw
    // noinspection InfiniteLoopJS
    while (true) {
        await doCrank().catch((error: any) => Log.error(`${error.stack}`));
        await sleep(INTERVAL);
    }

})();