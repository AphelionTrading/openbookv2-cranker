import 'dotenv/config';
import {Connection, PublicKey} from '@solana/web3.js';
import BN from 'bn.js';
import {FillEvent, OpenBookV2Client, OutEvent} from '@openbook-dex/openbook-v2'
import {AnchorProvider, Wallet} from '@coral-xyz/anchor';

export default class OpenBookCrank {

    protected connection: Connection;
    protected anchorProvider: AnchorProvider;
    protected eventHeapPks: PublicKey[] = [];
    protected markets: [] = [];
    protected openBookV2Client: OpenBookV2Client;
    protected marketPks: PublicKey[] = [];
    protected pubkey2AccountMap: Map<string, any> = new Map();

    constructor(connection: Connection, wallet: Wallet, programId: PublicKey) {
        this.connection = connection;
        this.anchorProvider = new AnchorProvider(connection, wallet, {});
        this.openBookV2Client = new OpenBookV2Client(this.anchorProvider, programId, {});
    }

    public async loadMarkets(marketPks: PublicKey[]) {
        this.marketPks = marketPks;
        this.markets = await this.openBookV2Client.program.account.market.fetchMultiple(marketPks) as [];
        this.eventHeapPks = this.markets.map((m: any) => {
            if (!m || !m.eventHeap) throw new Error("eventHeap missing, are you sure you passed the correct accounts?");
            return m.eventHeap;
        });

        for (let marketPk of marketPks) {
            this.pubkey2AccountMap.set(marketPk.toString(), this.markets[marketPks.indexOf(marketPk)]);
        }
    }

    public async getHeapAccounts() {
        const heap = this.openBookV2Client.program.account.eventHeap;
        return await heap.fetchMultipleAndContext(this.eventHeapPks);
    }

    public async getEventsConsumeIx(marketPk: PublicKey, consumeEventsLimit: BN) {
        const market = this.pubkey2AccountMap.get(marketPk.toString());
        const remainingAccounts = await this.getAccountsToConsume(market);
        const consumeEventsIx = await this.openBookV2Client.consumeEventsIx(
            marketPk,
            market,
            consumeEventsLimit,
            remainingAccounts
        );
        return {
            remainingAccounts,
            consumeEventsIx,
        }
    }

    //this is a modified version of client.getAccountsToConsume which does deduplication on the accounts returned
    protected async getAccountsToConsume(market: any) {
        let accounts: PublicKey[] = [];
        const eventHeap = await this.openBookV2Client.deserializeEventHeapAccount(market.eventHeap);
        if (eventHeap != null) {
            for (const node of eventHeap.nodes) {
                if (node.event.eventType === 0) {
                    const fillEvent: FillEvent = this.openBookV2Client.program.coder.types.decode(
                        'FillEvent',
                        Buffer.from([0, ...node.event.padding]),
                    );
                    accounts = accounts
                        .filter((a) => a !== fillEvent.maker)
                        .concat([fillEvent.maker]);
                } else {
                    const outEvent: OutEvent = this.openBookV2Client.program.coder.types.decode(
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

}