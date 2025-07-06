import { Bot, session } from 'grammy';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
import {
    MyContext,
    SessionData,
    WalletMonitor,
} from './types';

class SolanaWalletMonitor {
    private bot: Bot<MyContext>;
    private connection: Connection;
    private monitors: Map<string, WalletMonitor> = new Map();
    private isRunning = false;
    private pollingInterval = 30000; // 30 seconds

    constructor() {
        const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!telegramToken) {
            throw new Error('TELEGRAM_BOT_TOKEN environment variable is required');
        }
        this.bot = new Bot<MyContext>(telegramToken);
        this.connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
        this.setupSession();
        this.setupHandlers();
    }

    private setupSession(): void {
        this.bot.use(
            session({
                initial: (): SessionData => ({
                    monitoredWallets: [],
                }),
            }),
        );
    }

    private setupHandlers(): void {
        this.bot.command('start', async (ctx) => {
            await ctx.reply(
                '🚀 *Welcome to Solana Wallet Monitor!*\n\n' +
                    'Commands:\n' +
                    '• `/monitor <wallet_address>` - Start monitoring a wallet\n' +
                    '• `/stop <wallet_address>` - Stop monitoring a wallet\n' +
                    '• `/list` - List all monitored wallets\n' +
                    '• `/help` - Show this help message\n\n' +
                    'Send a wallet address to start monitoring!',
                { parse_mode: 'MarkdownV2' },
            );
        });

        this.bot.command('monitor', async (ctx) => {
            const args = ctx.message?.text?.split(' ').slice(1);
            if (!args || args.length === 0) {
                await ctx.reply(
                    '❌ Please provide a wallet address.\n\nExample: `/monitor So11111111111111111111111111111111111111112`',
                    { parse_mode: 'MarkdownV2' },
                );
                return;
            }
            const walletAddress = args.join(' ').trim();
            if (this.isValidSolanaAddress(walletAddress)) {
                const monitorKey = `${ctx.chat.id}_${walletAddress}`;
                if (this.monitors.has(monitorKey)) {
                    await ctx.reply('⚠️ This wallet is already being monitored!', { parse_mode: 'MarkdownV2' });
                    return;
                }
                this.monitors.set(monitorKey, {
                    chatId: ctx.chat.id,
                    walletAddress,
                });
                if (!ctx.session.monitoredWallets.includes(walletAddress)) {
                    ctx.session.monitoredWallets.push(walletAddress);
                }
                if (!this.isRunning) {
                    this.startMonitoring();
                }
                await ctx.reply(
                    `✅ *Started monitoring wallet:*\n\`${this.escapeMarkdown(walletAddress)}\`\n\n` +
                        'You will receive alerts for:\n' +
                        '• SOL transfers\n' +
                        '• Token transfers\n' +
                        '• NFT transactions\n' +
                        '• Program interactions',
                    { parse_mode: 'MarkdownV2' },
                );
            } else {
                ctx.reply('⚠️ Invalid Solana address. Please try again.');
            }
        });

        this.bot.command('balance', async (ctx) => {
            const args = ctx.message?.text?.split(' ').slice(1);
            if (!args || args.length === 0) {
                await ctx.reply(
                    '❌ Please provide a wallet address.\n\nExample: `/monitor So11111111111111111111111111111111111111112`',
                    { parse_mode: 'MarkdownV2' },
                );
                return;
            }
            const walletAddress = args.join(' ').trim();
            try {
                const publicKey = new PublicKey(walletAddress);
                const balanceLamports = await this.connection.getBalance(publicKey);
                const balanceSol = balanceLamports / 1_000_000_000;
                ctx.reply(`💰 Wallet Balance: *${this.escapeMarkdown(balanceSol.toString())} SOL*`, {
                    parse_mode: 'MarkdownV2',
                });
            } catch (error) {
                console.error(error);
                ctx.reply('❌ Failed to fetch balance. Please try again later.', { parse_mode: 'MarkdownV2' });
            }
        });

        this.bot.command('stop', async (ctx) => {
            const args = ctx.message?.text?.split(' ').slice(1);
            if (!args || args.length === 0) {
                await ctx.reply(
                    '❌ Please provide a wallet address to stop monitoring.\n\nExample: `/stop So11111111111111111111111111111111111111112`',
                    { parse_mode: 'MarkdownV2' },
                );
                return;
            }
            const walletAddress = args.join(' ').trim();
            const monitorKey = `${ctx.chat.id}_${walletAddress}`;
            if (this.monitors.has(monitorKey)) {
                this.monitors.delete(monitorKey);
                ctx.session.monitoredWallets = ctx.session.monitoredWallets.filter((addr) => addr !== walletAddress);
                await ctx.reply(`✅ *Stopped monitoring wallet:*\n\`${this.escapeMarkdown(walletAddress)}\``, {
                    parse_mode: 'MarkdownV2',
                });
            } else {
                await ctx.reply('❌ This wallet is not being monitored.', { parse_mode: 'MarkdownV2' });
            }
        });

        this.bot.command('list', async (ctx) => {
            const userMonitors = Array.from(this.monitors.values()).filter((monitor) => monitor.chatId === ctx.chat.id);
            if (userMonitors.length === 0) {
                await ctx.reply('📝 No wallets are currently being monitored.');
                return;
            }
            const walletList = userMonitors
                .map((monitor, index) => `${index + 1}. \`${this.escapeMarkdown(monitor.walletAddress)}\``)
                .join('\n');
            await ctx.reply(`📝 *Monitored wallets:*\n\n${walletList}`, { parse_mode: 'MarkdownV2' });
        });

        this.bot.command('help', async (ctx) => {
            await ctx.reply(
                '🤖 *Solana Wallet Monitor Bot*\n\n' +
                    '*Commands:*\n' +
                    '• `/monitor <wallet_address>` - Start monitoring a wallet\n' +
                    '• `/stop <wallet_address>` - Stop monitoring a wallet\n' +
                    '• `/list` - List monitored wallets\n' +
                    '• `/help` - Show this help message\n\n' +
                    '*The bot will alert you about:*\n' +
                    '• SOL transfers (in/out)\n' +
                    '• Token transfers\n' +
                    '• NFT transactions\n' +
                    '• DeFi interactions\n' +
                    '• Program calls\n\n' +
                    '*Monitoring interval:* 30 seconds',
                { parse_mode: 'MarkdownV2' },
            );
        });

        this.bot.on('message:text', async (ctx) => {
            const text = ctx.message.text.trim();
            if (text.length >= 32 && text.length <= 44 && /^[A-Za-z0-9]+$/.test(text)) {
                try {
                    new PublicKey(text);
                    await ctx.reply(
                        `🔍 *Detected wallet address!*\n\n` + `To monitor this wallet, use:\n` + `/monitor ${text}`,
                        { parse_mode: 'MarkdownV2' },
                    );
                } catch {
                    // ignore
                }
            }
        });

        this.bot.catch((err) => {
            console.error('Grammy error:', err);
        });
    }

    private escapeMarkdown(text: string): string {
        return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    private async startMonitoring(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('🔍 Starting wallet monitoring...');
        const monitorLoop = async () => {
            try {
                await this.checkAllWallets();
            } catch (error) {
                console.error('Error in monitoring loop:', error);
            }
            if (this.monitors.size > 0) {
                setTimeout(monitorLoop, this.pollingInterval);
            } else {
                this.isRunning = false;
                console.log('🛑 Stopped monitoring - no wallets to monitor');
            }
        };
        monitorLoop();
    }

    private async checkAllWallets(): Promise<void> {
        const promises = Array.from(this.monitors.values()).map((monitor) => this.checkWalletActivity(monitor));
        await Promise.allSettled(promises);
    }

    private async checkWalletActivity(monitor: WalletMonitor): Promise<void> {
        try {
            const publicKey = new PublicKey(monitor.walletAddress);
            const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit: 5 });
            if (signatures.length === 0) return;
            const latestSignature = signatures[0].signature;
            if (monitor.lastSignature && monitor.lastSignature === latestSignature) {
                return;
            }
            const newTransactions = monitor.lastSignature
                ? signatures.filter((sig) => sig.signature !== monitor.lastSignature)
                : [signatures[0]];
            for (const sigInfo of newTransactions) {
                await this.processTransaction(monitor, sigInfo);
            }
            monitor.lastSignature = latestSignature;
        } catch (error) {
            console.error(`Error checking wallet ${monitor.walletAddress}:`, error);
        }
    }

    private async processTransaction(monitor: WalletMonitor, sigInfo: any): Promise<void> {
        try {
            const transaction = await this.connection.getParsedTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0,
            });
            if (!transaction) return;
            const analysis = this.analyzeTransaction(transaction, monitor.walletAddress);
            if (analysis) {
                await this.sendAlert(monitor.chatId, analysis, sigInfo.signature);
            }
        } catch (error) {
            console.error(`Error processing transaction ${sigInfo.signature}:`, error);
        }
    }

    private analyzeTransaction(transaction: any, walletAddress: string): string | null {
        const instructions = transaction.transaction.message.instructions;
        const preBalances = transaction.meta.preBalances;
        const postBalances = transaction.meta.postBalances;
        const accountKeys = transaction.transaction.message.accountKeys;
        const walletIndex = accountKeys.findIndex((key: any) => key.pubkey.toString() === walletAddress);
        if (walletIndex === -1) return null;
        const solChange = (postBalances[walletIndex] - preBalances[walletIndex]) / 1e9;
        let analysis = '';
        if (Math.abs(solChange) > 0.001) {
            const direction = solChange > 0 ? 'RECEIVED' : 'SENT';
            const amount = Math.abs(solChange).toFixed(6);
            const emoji = solChange > 0 ? '📈' : '📉';
            analysis += `${emoji} *${direction}* ${amount} SOL\n`;
        }
        const tokenTransfers = transaction.meta.innerInstructions?.flat()?.filter((ix: any) => ix.parsed?.type === 'transfer') || [];
        for (const transfer of tokenTransfers) {
            if (transfer.parsed?.info?.destination === walletAddress) {
                analysis += `🪙 *RECEIVED* tokens\n`;
            } else if (transfer.parsed?.info?.source === walletAddress) {
                analysis += `🪙 *SENT* tokens\n`;
            }
        }
        const programInteractions = instructions
            .map((ix: any) => ix.programId.toString())
            .filter((pid: string) => pid !== '11111111111111111111111111111111');
        const uniquePrograms = [...new Set(programInteractions)];
        if (uniquePrograms.length > 0) {
            analysis += `🔧 *Program interactions:* ${uniquePrograms.length}\n`;
        }
        return analysis || null;
    }

    private async sendAlert(chatId: number, analysis: string, signature: string): Promise<void> {
        const timestamp = new Date().toLocaleString();
        const solscanLink = `https://solscan.io/tx/${signature}`;
        const escapedTimestamp = this.escapeMarkdown(timestamp);
        const message =
            `🚨 *Wallet Activity Detected*\n\n` +
            `${analysis}\n` +
            `🔗 [View Transaction](${solscanLink})\n` +
            `⏰ ${escapedTimestamp}`;
        try {
            await this.bot.api.sendMessage(chatId, message, {
                parse_mode: 'MarkdownV2',
                link_preview_options: { is_disabled: true },
            });
        } catch (error) {
            console.error('Error sending alert:', error);
            try {
                await this.bot.api.sendMessage(
                    chatId,
                    `🚨 Wallet Activity Detected\n\n${analysis.replace(/\*|\\/g, '')}\n🔗 ${solscanLink}\n⏰ ${timestamp}`,
                );
            } catch (fallbackError) {
                console.error('Fallback alert also failed:', fallbackError);
            }
        }
    }

    private isValidSolanaAddress(address: string): boolean {
        try {
            const pubKey = new PublicKey(address);
            return PublicKey.isOnCurve(pubKey.toBuffer());
        } catch (e) {
            return false;
        }
    }

    public async start(): Promise<void> {
        console.log('🤖 Starting Solana Wallet Monitor Bot...');
        await this.bot.api.setMyCommands([
            { command: 'start', description: 'Start the bot' },
            { command: 'monitor', description: 'Monitor a wallet address' },
            { command: 'balance', description: 'Balance of wallet address' },
            { command: 'stop', description: 'Stop monitoring a wallet' },
            { command: 'list', description: 'List monitored wallets' },
            { command: 'help', description: 'Show help information' },
        ]);
        await this.bot.start();
        console.log('🚀 Bot is running! Send /start to begin monitoring wallets');
    }

    public async stop(): Promise<void> {
        console.log('🛑 Stopping bot...');
        await this.bot.stop();
    }
}

export default SolanaWalletMonitor;
