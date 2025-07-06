export interface SessionData {
    monitoredWallets: string[];
}

import {Context, SessionFlavor} from 'grammy';
export type MyContext = Context & SessionFlavor<SessionData>;

export interface WalletMonitor {
    chatId: number;
    walletAddress: string;
    lastSignature?: string;
}

export interface Transaction {
    signature: string;
    slot: number;
    timestamp: number;
    type: string;
    amount?: number;
    token?: string;
    from?: string;
    to?: string;
}
