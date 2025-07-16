import {config} from "./config";
import WebSocket from 'ws';
import {Connection} from "@solana/web3.js";
import {LogsNotification, WSConnection} from "./types";

export class SubscriptionsPool {
    private connection = new Connection(config.rpcUrl);
    private websocketPool: WSConnection[] = [];
    private walletSubscriptions = new Map<string, Set<number>>(); // walletAddress -> Set of userIds
    private connectionIndex = 1;
    private readonly messageCallback: (userId: number, message: string) => void;

    // Auto-reconnect configuration
    private readonly maxReconnectAttempts = 5;
    private readonly baseReconnectDelay = 1000; // 1 second
    private readonly maxReconnectDelay = 30000; // 30 seconds
    private reconnectTimers = new Map<number, NodeJS.Timeout>();
    private isShuttingDown = false;

    constructor(messageCallback: (userId: number, message: string) => void) {
        this.messageCallback = messageCallback;
    }

    async addWalletToPool(walletAddress: string, userId: number) {
        // Add user to wallet subscription
        if (!this.walletSubscriptions.has(walletAddress)) {
            this.walletSubscriptions.set(walletAddress, new Set());
        }
        this.walletSubscriptions.get(walletAddress)!.add(userId);

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

    findAvailableConnection(): WSConnection | undefined {
        return this.websocketPool.find(conn =>
            conn.wallets.size < config.maxWsConnections &&
            conn.ws.readyState === WebSocket.OPEN
        );
    }

    async createNewConnection(): Promise<WSConnection> {
        if (this.websocketPool.length >= config.maxConnections) {
            throw new Error('Maximum WebSocket connections reached');
        }

        const connectionId = this.connectionIndex++;
        return this.establishConnection(connectionId);
    }

    private async establishConnection(connectionId: number, reconnectAttempt = 0): Promise<WSConnection> {
        const ws = new WebSocket(this.getWebSocketEndpoint());
        const connectionInPool = this.websocketPool.find(conn => conn.id === connectionId);
        const connection: WSConnection = {
            ws,
            wallets: connectionInPool ? connectionInPool.wallets : new Set<string>(),
            subscriptions:  connectionInPool ? connectionInPool.subscriptions : new Map(),
            id: connectionId,
            reconnectAttempts: reconnectAttempt,
            isReconnecting: reconnectAttempt > 0
        };

        return new Promise((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
                ws.close();
                reject(new Error(`Connection timeout for connection ${connectionId}`));
            }, 10000); // 10 second timeout

            ws.on('open', async () => {
                clearTimeout(connectionTimeout);
                console.log(`WebSocket connection ${connectionId} opened${reconnectAttempt > 0 ? ' (reconnected)' : ''}`);

                // Clear any existing reconnect timer
                const existingTimer = this.reconnectTimers.get(connectionId);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                    this.reconnectTimers.delete(connectionId);
                }

                // Reset reconnect attempts on successful connection
                connection.reconnectAttempts = 0;
                connection.isReconnecting = false;

                // Add to pool if it's a new connection
                if (reconnectAttempt === 0) {
                    this.websocketPool.push(connection);
                } else {
                    // Replace the old connection in the pool
                    const existingIndex = this.websocketPool.findIndex(conn => conn.id === connectionId);
                    if (existingIndex !== -1) {
                        this.websocketPool[existingIndex] = connection;
                    } else {
                        this.websocketPool.push(connection);
                    }
                }

                // Resubscribe all wallets that were on this connection
                if (reconnectAttempt > 0) {
                    await this.resubscribeWalletsForConnection(connection);
                }

                resolve(connection);
            });

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());

                    // Handle subscription confirmations
                    if (message.id && message.result && typeof message.result === 'number') {
                        console.log(`✅ Subscription confirmed with ID: ${message.result} on connection ${connectionId}`);
                        return;
                    }

                    if (message.method === 'logsNotification') {
                        await this.handleLogsNotification(message as LogsNotification);
                    }
                } catch (error) {
                    console.error(`Error processing WebSocket message on connection ${connectionId}:`, error);
                }
            });

            ws.on('error', (error) => {
                clearTimeout(connectionTimeout);
                console.error(`WebSocket connection ${connectionId} error:`, error);

                if (reconnectAttempt === 0) {
                    reject(error);
                }
            });

            ws.on('close', (code, reason) => {
                clearTimeout(connectionTimeout);
                console.log(`WebSocket connection ${connectionId} closed. Code: ${code}, Reason: ${reason}`);

                // Don't reconnect if we're shutting down
                if (this.isShuttingDown) {
                    this.removeConnectionFromPool(connectionId);
                    return;
                }

                // Attempt to reconnect if this connection had subscriptions
                const connectionInPool = this.websocketPool.find(conn => conn.id === connectionId);
                if (connectionInPool && connectionInPool.wallets.size > 0) {
                    connectionInPool.reconnectAttempts = connectionInPool.reconnectAttempts! + 1;
                    this.scheduleReconnect(connectionId, connectionInPool.reconnectAttempts!);
                } else {
                    this.removeConnectionFromPool(connectionId);
                }
            });
        });
    }

    private async scheduleReconnect(connectionId: number, currentAttempt: number) {
        if (currentAttempt >= this.maxReconnectAttempts) {
            console.error(`Max reconnect attempts reached for connection ${connectionId}. Giving up.`);
            await this.removeConnectionFromPool(connectionId);
            return;
        }

        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, currentAttempt),
            this.maxReconnectDelay
        );

        console.log(`Scheduling reconnect for connection ${connectionId} in ${delay}ms (attempt ${currentAttempt + 1}/${this.maxReconnectAttempts})`);

        const timer = setTimeout(async () => {
            this.reconnectTimers.delete(connectionId);

            try {
                await this.establishConnection(connectionId, currentAttempt + 1);
            } catch (error) {
                console.error(`Reconnect failed for connection ${connectionId}:`, error);
                await this.scheduleReconnect(connectionId, currentAttempt + 1);
            }
        }, delay);

        this.reconnectTimers.set(connectionId, timer);
    }

    private async resubscribeWalletsForConnection(connection: WSConnection) {
        console.log(`Resubscribing ${connection.wallets.size} wallets for connection ${connection.id}`);

        const walletsToResubscribe = Array.from(connection.wallets);
        connection.wallets.clear();
        connection.subscriptions.clear();

        for (const walletAddress of walletsToResubscribe) {
            try {
                await this.subscribeWalletToConnection(walletAddress, connection);
            } catch (error) {
                console.error(`Failed to resubscribe wallet ${walletAddress} on connection ${connection.id}:`, error);
            }
        }
    }

    private async removeConnectionFromPool(connectionId: number) {
        const index = this.websocketPool.findIndex(conn => conn.id === connectionId);
        if (index > -1) {
            const connection = this.websocketPool[index];

            // Clean up reconnect timer if exists
            const timer = this.reconnectTimers.get(connectionId);
            if (timer) {
                clearTimeout(timer);
                this.reconnectTimers.delete(connectionId);
            }

            // Redistribute wallets to other connections
            if (connection.wallets.size > 0 && !this.isShuttingDown) {
                await this.redistributeWallets(connection.wallets);
            }

            this.websocketPool.splice(index, 1);
            console.log(`Removed connection ${connectionId} from pool`);
        }
    }

    private async redistributeWallets(wallets: Set<string>) {
        console.log(`Redistributing ${wallets.size} wallets to other connections`);

        for (const walletAddress of wallets) {
            // Only redistribute if there are still subscribers for this wallet
            if (this.walletSubscriptions.has(walletAddress)) {
                try {
                    let targetConnection = this.findAvailableConnection();

                    if (!targetConnection) {
                        targetConnection = await this.createNewConnection();
                    }

                    await this.subscribeWalletToConnection(walletAddress, targetConnection);
                } catch (error) {
                    console.error(`Failed to redistribute wallet ${walletAddress}:`, error);
                }
            }
        }
    }

    private async handleLogsNotification(message: LogsNotification) {
        const { signature, err, logs } = message.params.result.value;

        try {
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
        } catch (error) {
            console.error('Error handling logs notification:', error);
        }
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

        try {
            connection.ws.send(JSON.stringify(subscribeMessage));
            connection.wallets.add(walletAddress);
            connection.subscriptions.set(walletAddress, subscribeMessage.id);

            console.log(`Subscribed wallet ${walletAddress} to connection ${connection.id}`);
        } catch (error) {
            console.error(`Failed to subscribe wallet ${walletAddress} to connection ${connection.id}:`, error);
            throw error;
        }
    }

    async unsubscribeWalletFromAllConnections(walletAddress: string) {
        for (const connection of this.websocketPool) {
            if (connection.wallets.has(walletAddress)) {
                const subscriptionId = connection.subscriptions.get(walletAddress);

                if (subscriptionId && connection.ws.readyState === WebSocket.OPEN) {
                    try {
                        const unsubscribeMessage = {
                            jsonrpc: '2.0',
                            id: Date.now(),
                            method: 'logsUnsubscribe',
                            params: [subscriptionId]
                        };

                        connection.ws.send(JSON.stringify(unsubscribeMessage));
                    } catch (error) {
                        console.error(`Failed to unsubscribe wallet ${walletAddress} from connection ${connection.id}:`, error);
                    }
                }

                connection.wallets.delete(walletAddress);
                connection.subscriptions.delete(walletAddress);

                console.log(`Unsubscribed wallet ${walletAddress} from connection ${connection.id}`);
            }
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

            await this.messageCallback(userId, message);
        } catch (error) {
            console.error('Error sending notification:', error);
        }
    }

    // Method to get connection health status
    getConnectionStatus() {
        return this.websocketPool.map(conn => ({
            id: conn.id,
            state: conn.ws.readyState,
            walletsCount: conn.wallets.size,
            isReconnecting: conn.isReconnecting || false,
            reconnectAttempts: conn.reconnectAttempts || 0
        }));
    }

    // Graceful shutdown method
    async shutdown() {
        console.log('Shutting down WebSocket pool...');
        this.isShuttingDown = true;

        // Clear all reconnect timers
        for (const timer of this.reconnectTimers.values()) {
            clearTimeout(timer);
        }
        this.reconnectTimers.clear();

        // Close all connections
        const closePromises = this.websocketPool.map(conn => {
            return new Promise<void>((resolve) => {
                if (conn.ws.readyState === WebSocket.OPEN) {
                    conn.ws.close();
                    conn.ws.once('close', () => resolve());
                } else {
                    resolve();
                }
            });
        });

        await Promise.all(closePromises);
        this.websocketPool.length = 0;
        console.log('WebSocket pool shutdown complete');
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
