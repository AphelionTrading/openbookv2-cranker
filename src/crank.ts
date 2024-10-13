import 'dotenv/config';
import * as os from 'os';
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
import {OpenBookV2Client, sleep} from '@openbook-dex/openbook-v2'
import {AnchorProvider, Wallet} from '@coral-xyz/anchor';


const {
    RPC_URL,
    WALLET_PATH,
    KEYPAIR,
    PROGRAM_ID,
    INTERVAL,
    CONSUME_EVENTS_LIMIT,
    CLUSTER,
    MARKETS, // comma separated list of market pubkeys to crank
    PRIORITY_QUEUE_LIMIT, // queue length at which to apply the priority fee
    PRIORITY_CU_PRICE, // extra microlamports per cu for high fee markets
    PRIORITY_CU_LIMIT, // compute limit
    MAX_TX_INSTRUCTIONS, // max instructions per transaction
    CU_PRICE, // extra microlamports per cu for any transaction
    PRIORITY_MARKETS, // input to add comma seperated list of markets that force fee bump
} = process.env;

const cluster: 'mainnet' | 'testnet' | 'devnet' = CLUSTER as 'mainnet' | 'testnet' | 'devnet' || 'mainnet';
const interval = parseInt(INTERVAL || '1000');
const consumeEventsLimit = new BN(CONSUME_EVENTS_LIMIT || '19');
const priorityMarkets = PRIORITY_MARKETS ? PRIORITY_MARKETS.split(',') : [];
const priorityQueueLimit = parseInt(PRIORITY_QUEUE_LIMIT || '100');
const cuPrice = parseInt(CU_PRICE || '0');
const priorityCuPrice = parseInt(PRIORITY_CU_PRICE || '100000');
const CuLimit = parseInt(PRIORITY_CU_LIMIT || '50000');
const maxTxInstructions = parseInt(MAX_TX_INSTRUCTIONS || '1');
const programId = new PublicKey(
    PROGRAM_ID || cluster == 'mainnet'
        ? 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb'
        : 'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb',
);

const walletFile = process.env.WALLET_PATH || os.homedir() + '/openbook-v2/ts/client/src/wallet.json';
const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(KEYPAIR || fs.readFileSync(walletFile, 'utf-8'))),
);
const wallet = new Wallet(payer);

const defaultRpcUrls = {
    'mainnet': 'https://api.mainnet-beta.solana.com',
    'testnet': 'https://api.testnet.solana.com',
    'devnet': 'https://api.devnet.solana.com',
}
const rpcUrl = RPC_URL ? RPC_URL : defaultRpcUrls[cluster];
const connection = new Connection(rpcUrl, 'processed' as Commitment);

console.log('Starting OpenBook v2 Cranker');
console.log("Loaded MARKETS:", MARKETS);
console.log("Loaded WALLET_PATH:", WALLET_PATH);
console.log("Loaded RPC_URL:", RPC_URL);
console.log('Loaded Wallet:', payer.publicKey.toString());

async function run() {

    let recentBlockhash: BlockhashWithExpiryBlockHeight = await connection.getLatestBlockhash('finalized');
    setInterval(() => {
        connection.getLatestBlockhash('finalized')
            .then(hash => recentBlockhash = hash)
            .catch(e => console.error(`Couldn't get blockhash: ${e}`))
    }, 1000);

    // list of markets to crank
    const provider = new AnchorProvider(connection, wallet, {})
    const client = new OpenBookV2Client(provider, programId, {});

    const marketPks = MARKETS ? MARKETS.split(',').map((m) => new PublicKey(m)) : [];

    if (!marketPks.length) {
        console.error('No valid market pubkeys provided!');
        return;
    }

    const markets = await client.program.account.market.fetchMultiple(marketPks);
    const eventHeapPks = markets.map((m) => m!.eventHeap);

    //pass a minimum Context Slot to GMA
    let minContextSlot = 0;

    while (true) {
        try {
            let crankInstructionsQueue: TransactionInstruction[] = [];
            let instructionBumpMap = new Map();

            const eventHeapAccounts = await client.program.account.eventHeap.fetchMultipleAndContext(eventHeapPks);
            const contextSlot = eventHeapAccounts[0]!.context.slot;
            //increase the minContextSlot to avoid processing the same slot twice

            if (contextSlot < minContextSlot) {
                console.log(`already processed slot ${contextSlot}, skipping...`)
            }
            minContextSlot = contextSlot + 1;

            for (let i = 0; i < eventHeapAccounts.length; i++) {
                const eventHeap = eventHeapAccounts[i]!.data;
                const heapSize = eventHeap.header.count;
                const market = markets[i]!;
                const marketPk = marketPks[i];
                if (heapSize === 0) continue;

                const remainingAccounts = await client.getAccountsToConsume(market);
                const consumeEventsIx = await client.consumeEventsIx(marketPk, market, consumeEventsLimit, remainingAccounts)

                crankInstructionsQueue.push(consumeEventsIx);

                //if the queue is large then add the priority fee
                if (heapSize > priorityQueueLimit) {
                    instructionBumpMap.set(consumeEventsIx, 1);
                }

                //bump transaction fee if market address is included in PRIORITY_MARKETS env
                if (priorityMarkets.includes(marketPk.toString())) {
                    instructionBumpMap.set(consumeEventsIx, 1);
                }

                console.log(
                    `market ${marketPk} creating consume events for ${heapSize} events (${remainingAccounts.length} accounts)`,
                );
            }

            //send the crank transaction if there are markets that need cranked
            if (crankInstructionsQueue.length > 0) {
                //chunk the instructions to ensure transactions are not too large
                let chunkedCrankInstructions = chunk(
                    crankInstructionsQueue,
                    maxTxInstructions,
                );

                chunkedCrankInstructions.forEach((transactionInstructions) => {
                    let shouldBumpFee = false;
                    let crankTransaction = new Transaction({...recentBlockhash});

                    crankTransaction.add(
                        ComputeBudgetProgram.setComputeUnitLimit({
                            units: CuLimit * maxTxInstructions,
                        }),
                    );

                    transactionInstructions.forEach(function (crankInstruction) {
                        //check the instruction for flag to bump fee
                        instructionBumpMap.get(crankInstruction)
                            ? (shouldBumpFee = true)
                            : null;
                    });

                    if (shouldBumpFee || cuPrice) {
                        crankTransaction.add(
                            ComputeBudgetProgram.setComputeUnitPrice({
                                microLamports: shouldBumpFee ? priorityCuPrice : cuPrice,
                            }),
                        );
                    }

                    crankTransaction.add(...transactionInstructions);

                    crankTransaction.sign(payer);

                    //send the transaction
                    connection
                        .sendRawTransaction(crankTransaction.serialize(), {
                            skipPreflight: true,
                            maxRetries: 2,
                        })
                        .then((txId) =>
                            console.log(
                                `Cranked ${transactionInstructions.length} market(s): ${txId}`,
                            ),
                        );
                });
            }
        } catch (e) {
            if (e instanceof Error) {
                switch (e.message) {
                    case 'Minimum context slot has not been reached':
                        //lightweight warning message for known "safe" errors
                        console.warn(e.message);
                        break;
                    default:
                        console.error(e);
                }
            }
        }
        await sleep(interval);
    }
}

function chunk<T>(array: T[], size: number): T[][] {
    const chunkedArray: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArray.push(array.slice(i, i + size));
    }
    return chunkedArray;
}

run();