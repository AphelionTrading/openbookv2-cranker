import 'dotenv/config';
import * as fs from 'fs';
import {
    Keypair,
    Commitment,
    Connection,
    PublicKey,
    Transaction,
    ComputeBudgetProgram,
    BlockhashWithExpiryBlockHeight,
    TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import {FillEvent, OpenBookV2Client, OutEvent, sleep} from '@openbook-dex/openbook-v2'
import {AnchorProvider, Wallet} from '@coral-xyz/anchor';
import Log from "@solpkr/log";
import Args from "@solpkr/args";

const args = Args.load();

const DEFAULTS = {
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
    DEBUG: false
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

async function run() {

    const connection = new Connection(RPC_URL, 'processed' as Commitment);
    const wallet = new Wallet(Keypair.fromSecretKey(Uint8Array.from(JSON.parse(KEYPAIR))));

    if (DEBUG) Log.info('DEBUG ENABLED');
    Log.info('Starting OpenBook v2 Cranker');
    Log.info(`Loaded MARKETS: ${MARKETS}`);
    Log.info(`Loaded WALLET_PATH: ${WALLET_PATH}`);
    Log.info(`Loaded RPC_URL: ${RPC_URL}`);
    Log.info(`Loaded RPC_URL: ${RPC_URL}`);
    Log.info(`Loaded Wallet: ${wallet.payer.publicKey.toString()}`);

    let recentBlockhash: BlockhashWithExpiryBlockHeight = await connection.getLatestBlockhash('finalized');
    setInterval(() => {
        connection.getLatestBlockhash('finalized')
            .then(hash => recentBlockhash = hash)
            .catch(e => Log.error(`Couldn't get blockhash: ${e.message}`))
    }, 1000);

    const provider = new AnchorProvider(connection, wallet, {})
    const client = new OpenBookV2Client(provider, PROGRAM_ID, {});

    const marketPks = MARKETS ? MARKETS.split(',').map((m: string) => new PublicKey(m)) : [];
    if (!marketPks.length) throw new Error('No valid market pubkeys provided!');

    const markets = await client.program.account.market.fetchMultiple(marketPks);
    const eventHeapPks = markets.map((m) => m!.eventHeap);

    let minContextSlot = 0;

    while (true) {
        try {
            let crankInstructionsQueue: TransactionInstruction[] = [];
            let instructionBumpMap = new Map();

            const eventHeapAccounts = await client.program.account.eventHeap.fetchMultipleAndContext(eventHeapPks);

            const contextSlot = eventHeapAccounts[0]!.context.slot;
            if (contextSlot < minContextSlot) {
                if (DEBUG) Log.info(`already processed slot ${contextSlot}, skipping...`);
                await sleep(200);
                continue;
            }
            minContextSlot = contextSlot + 1;  //increase the minContextSlot to avoid processing the same slot twice

            for (let i = 0; i < eventHeapAccounts.length; i++) {
                const eventHeap = eventHeapAccounts[i]!.data;
                const heapSize = eventHeap.header.count;
                if (heapSize < MIN_EVENTS) continue;

                const market = markets[i]!;
                const marketPk = marketPks[i]
                const remainingAccounts = await getAccountsToConsume(client, market);
                const consumeEventsIx = await client.consumeEventsIx(marketPk, market, CONSUME_EVENTS_LIMIT, remainingAccounts)

                crankInstructionsQueue.push(consumeEventsIx);

                //if the queue is large then add the priority fee
                if (heapSize > PRIORITY_QUEUE_LIMIT) {
                    instructionBumpMap.set(consumeEventsIx, 1);
                }

                //bump transaction fee if market address is included in PRIORITY_MARKETS env
                if (PRIORITY_MARKETS.split(',').includes(marketPk.toString())) {
                    instructionBumpMap.set(consumeEventsIx, 1);
                }

                Log.info(
                    `market ${marketPk} creating consume events for ${heapSize} events (${remainingAccounts.length} accounts)`,
                );
            }

            //send the crank transaction if there are markets that need cranked
            if (crankInstructionsQueue.length > 0) {
                //chunk the instructions to ensure transactions are not too large
                let chunkedCrankInstructions = chunk(
                    crankInstructionsQueue,
                    MAX_TX_INSTRUCTIONS,
                );

                chunkedCrankInstructions.forEach((transactionInstructions) => {
                    let shouldBumpFee = false;
                    let crankTransaction = new Transaction({...recentBlockhash});

                    crankTransaction.add(
                        ComputeBudgetProgram.setComputeUnitLimit({
                            units: PRIORITY_CU_LIMIT * MAX_TX_INSTRUCTIONS,
                        }),
                    );

                    transactionInstructions.forEach(function (crankInstruction) {
                        //check the instruction for flag to bump fee
                        instructionBumpMap.get(crankInstruction)
                            ? (shouldBumpFee = true)
                            : null;
                    });

                    if (shouldBumpFee || CU_PRICE) {
                        crankTransaction.add(
                            ComputeBudgetProgram.setComputeUnitPrice({
                                microLamports: shouldBumpFee ? PRIORITY_CU_PRICE : CU_PRICE,
                            }),
                        );
                    }

                    crankTransaction.add(...transactionInstructions);

                    crankTransaction.sign(wallet.payer);

                    //send the transaction
                    connection
                        .sendRawTransaction(crankTransaction.serialize(), {
                            skipPreflight: true,
                            maxRetries: 2,
                        })
                        .then((txId) => Log.info(`Cranked ${transactionInstructions.length} market(s): ${txId}`));
                });
            }
        } catch (error: any) {
            Log.error(`${error.stack} \n Error: ${error.message}`);
        }
        await sleep(INTERVAL);
    }
}

//this is a modified version of client.getAccountsToConsume which does deduplication on the accounts returned
async function getAccountsToConsume(client: OpenBookV2Client, market: any) {
    let accounts: PublicKey[] = [];
    const eventHeap = await client.deserializeEventHeapAccount(market.eventHeap);
    if (eventHeap != null) {
        for (const node of eventHeap.nodes) {
            if (node.event.eventType === 0) {
                const fillEvent: FillEvent = client.program.coder.types.decode(
                    'FillEvent',
                    Buffer.from([0, ...node.event.padding]),
                );
                accounts = accounts
                    .filter((a) => a !== fillEvent.maker)
                    .concat([fillEvent.maker]);
            } else {
                const outEvent: OutEvent = client.program.coder.types.decode(
                    'OutEvent',
                    Buffer.from([0, ...node.event.padding]),
                );
                accounts = accounts
                    .filter((a) => a !== outEvent.owner)
                    .concat([outEvent.owner]);
            }
        }
    }
    const uniqueAccountStrings = new Set(accounts.map(account => account.toString()));
    return Array.from(uniqueAccountStrings).map(accountString => new PublicKey(accountString));
}

function chunk<T>(array: T[], size: number): T[][] {
    const chunkedArray: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArray.push(array.slice(i, i + size));
    }
    return chunkedArray;
}

//return value from .env or --args=123 or return the default value
function config(key: string) {
    return args.get(key, DEFAULTS[key])
}

function getKeyPair(walletPath: string) {
    const keypair = args.get('KEYPAIR', false);
    return keypair ? keypair : fs.readFileSync(walletPath, 'utf-8');
}

run();