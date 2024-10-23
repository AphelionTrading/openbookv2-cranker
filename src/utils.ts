import Args from "@solpkr/args";
import * as fs from 'fs';
import {DEFAULTS} from "./crank";
import {Keypair, TransactionInstruction, TransactionMessage, VersionedTransaction} from "@solana/web3.js";

const args = Args.load();

export function chunk<T>(array: T[], size: number): T[][] {
    const chunkedArray: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArray.push(array.slice(i, i + size));
    }
    return chunkedArray;
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

//load raw key from string or from a file
export function getKeyPair(walletPath: string) {
    const keypair = args.get('KEYPAIR', false);
    return keypair ? keypair : fs.readFileSync(walletPath, 'utf-8');
}

//return value from .env or --args=123 or return the default value
export function config(key: string) {
    return args.get(key, DEFAULTS[key])
}

export function generateMessageV0Transaction(blockhash: string, instructions: TransactionInstruction[], keyPair: Keypair, sign: boolean = true) {
    const messageV0 = new TransactionMessage({
        payerKey: keyPair.publicKey,
        recentBlockhash: blockhash,
        instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    if (sign) transaction.sign([keyPair]);

    return transaction;
}