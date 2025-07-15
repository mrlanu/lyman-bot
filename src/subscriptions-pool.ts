import {config} from "./config";
import WebSocket from 'ws';
import {Connection} from "@solana/web3.js";
import {LogsNotification, WSConnection} from "./types";

export class SubscriptionsPool {

    private connection = new Connection(config.rpcUrl);
    private websocketPool: WSConnection[] = [];
    private walletSubscriptions = new Map(); // walletAddress -> Set of userIds
    private connectionIndex = 0;
    private readonly messageCallback: (userId: number, message: string) => void;

    constructor(messageCallback: (userId: number, message: string) => void) {
        this.messageCallback = messageCallback;
    }

    async addWalletToPool(walletAddress: string, userId: number) {
        // Add user to wallet subscription
        if (!this.walletSubscriptions.has(walletAddress)) {
            this.walletSubscriptions.set(walletAddress, new Set());
        }
        this.walletSubscriptions.get(walletAddress).add(userId);

        // Find or create a connection with available slots
        let targetConnection = this.findAvailableConnection();

        if (!targetConnection) {
            targetConnection = await this.createNewConnection();
        }

        // Add wallet to the connection
        await this.subscribeWalletToConnection(walletAddress, targetConnection);
    }

    async removeWalletFromPool(walletAddress: string, userId: number) {
        const subscribers = this.walletSubscriptions.get(walletAddress);

        if (subscribers) {
            subscribers.delete(userId);

            // If no more subscribers, remove from all connections
            if (subscribers.size === 0) {
                this.walletSubscriptions.delete(walletAddress);
                await this.unsubscribeWalletFromAllConnections(walletAddress);
            }
        }
    }

    findAvailableConnection() {
        return this.websocketPool.find(conn =>
            conn.wallets.size < config.maxWsConnections &&
            conn.ws.readyState === WebSocket.OPEN
        );
    }

    async createNewConnection(): Promise<WSConnection> {
        if (this.websocketPool.length >= config.maxConnections) {
            throw new Error('Maximum WebSocket connections reached');
        }

        const ws = new WebSocket(this.getWebSocketEndpoint());
        const connection = {
            ws,
            wallets: new Set<string>(),
            subscriptions: new Map(), // walletAddress -> subscriptionId
            id: this.connectionIndex++
        };

        return new Promise((resolve, reject) => {
            ws.on('open', () => {
                console.log(`WebSocket connection ${connection.id} opened`);
                this.websocketPool.push(connection);
                resolve(connection);
            });

            ws.on('message', async (data) => {
                console.log('Gor a message');
                try {
                    const message = JSON.parse(data.toString());

                    if (message.id === 1 && message.result && typeof message.result === 'number') {
                        console.log(`✅ Logs subscription confirmed with ID: ${message.result}`);
                        return;
                    }

                    // Handle account subscription confirmation
                    if (message.id === 2 && message.result && typeof message.result === 'number') {
                        console.log(`✅ Account subscription confirmed with ID: ${message.result}`);
                        return;
                    }

                    if (message.method === 'logsNotification') {
                        const { signature, err, logs } = (message as LogsNotification).params.result.value;

                        const transaction = await this.connection.getParsedTransaction(signature, {
                            commitment: 'confirmed',
                            maxSupportedTransactionVersion: 0
                        });

                        if (!transaction) {
                            console.log(`❌ Could not fetch transaction: ${signature}`);
                            return;
                        }

                        // Find which wallet this notification is for
                        const walletAddress = transaction.transaction.message.accountKeys
                            .find(key => key.signer)?.pubkey.toBase58() || null;

                        if (walletAddress) {
                            console.log(`Transaction detected for wallet ${walletAddress}: ${signature}`);
                            await this.notifyAllSubscribers(walletAddress, signature, logs);
                        }
                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            });

            ws.on('error', (error) => {
                console.error(`WebSocket connection ${connection.id} error:`, error);
                reject(error);
            });

            ws.on('close', () => {
                console.log(`WebSocket connection ${connection.id} closed`);
                this.removeConnection(connection);
            });
        });
    }

    async subscribeWalletToConnection(walletAddress: string, connection: WSConnection) {
        if (connection.wallets.has(walletAddress)) {
            return; // Already subscribed
        }

        const subscribeMessage = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'logsSubscribe',
            params: [
                {
                    mentions: [walletAddress]
                },
                {
                    commitment: 'confirmed'
                }
            ]
        };

        connection.ws.send(JSON.stringify(subscribeMessage));
        connection.wallets.add(walletAddress);
        connection.subscriptions.set(walletAddress, subscribeMessage.id);

        console.log(`Subscribed wallet ${walletAddress} to connection ${connection.id}`);
    }

    async unsubscribeWalletFromAllConnections(walletAddress: string) {
        for (const connection of this.websocketPool) {
            if (connection.wallets.has(walletAddress)) {
                const subscriptionId = connection.subscriptions.get(walletAddress);

                if (subscriptionId) {
                    const unsubscribeMessage = {
                        jsonrpc: '2.0',
                        id: Date.now(),
                        method: 'logsUnsubscribe',
                        params: [subscriptionId]
                    };

                    connection.ws.send(JSON.stringify(unsubscribeMessage));
                }

                connection.wallets.delete(walletAddress);
                connection.subscriptions.delete(walletAddress);

                console.log(`Unsubscribed wallet ${walletAddress} from connection ${connection.id}`);
            }
        }
    }

    removeConnection(connection: WSConnection) {
        const index = this.websocketPool.indexOf(connection);
        if (index > -1) {
            this.websocketPool.splice(index, 1);
        }
    }

    async notifyAllSubscribers(walletAddress: string, signature: string, logs: string[]) {
        const subscribers = this.walletSubscriptions.get(walletAddress);

        if (!subscribers) return;

        for (const userId of subscribers) {
            await this.notifyUser(userId, walletAddress, signature, logs);
        }
    }

    async notifyUser(userId: number, walletAddress: string, signature: string, logs: string[]) {
        try {
            const message =
                `🔔 Transaction Alert!\n\n` +
                `📍 Wallet: ${walletAddress}\n` +
                `🔗 Signature: ${signature}\n` +
                `📊 View on Solscan: https://solscan.io/tx/${signature}\n\n` +
                `📋 Logs:\n${logs.slice(0, 3).join('\n')}${logs.length > 3 ? '\n...' : ''}`;

            this.messageCallback(userId, message);//this.bot.api.sendMessage(userId, message);
        } catch (error) {
            console.error('Error sending notification:', error);
        }
    }

    private getWebSocketEndpoint(): string {
        const rpcUrl = config.rpcUrl || 'https://api.devnet.solana.com';

        // Common RPC to WebSocket conversions
        if (rpcUrl.includes('mainnet-beta.solana.com')) {
            return 'wss://api.mainnet-beta.solana.com/';
        } else if (rpcUrl.includes('devnet.solana.com')) {
            return 'wss://api.devnet.solana.com/';
        } else if (rpcUrl.includes('testnet.solana.com')) {
            return 'wss://api.testnet.solana.com/';
        } else if (rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')) {
            return rpcUrl.replace('http', 'ws');
        } else {
            // For custom RPC endpoints, try converting http to ws
            return rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        }
    }
}
