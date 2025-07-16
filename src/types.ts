import {Context, SessionFlavor} from 'grammy';
import WebSocket from "ws";

export interface SessionData {}

export type MyContext = Context & SessionFlavor<SessionData>;

export interface WSConnection {
    ws: WebSocket;
    wallets: Set<string>;
    subscriptions: Map<any, any>;
    id: number;
    reconnectAttempts?: number;
    isReconnecting?: boolean;
}

// WebSocket subscription response types
export interface LogsNotification {
    params: {
        result: {
            context: { slot: number };
            value: {
                signature: string;
                err: any;
                logs: string[];
            };
        };
    }
}
