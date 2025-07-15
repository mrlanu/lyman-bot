import {Bot, GrammyError, HttpError} from "grammy";
import {config} from "./config";
import {MyContext} from "./types";
import {PublicKey} from "@solana/web3.js";
import {SubscriptionsPool} from "./subscriptions-pool";

export class LymanBot {
    bot: Bot<MyContext>;

    notifyBot = async (userId: number, message: string) => {
        await this.bot.api.sendMessage(userId, message);
    };

    private subscriptionsPool: SubscriptionsPool = new SubscriptionsPool(this.notifyBot);

    constructor() {
        this.bot = new Bot(config.telegramToken);
        this.setupCommands();
    }

    setupCommands() {

        this.bot.command('start', (ctx) => {

            await ctx.reply(
                'Welcome to Solana Wallet Monitor! 🚀\n\n' +
                'Commands:\n' +
                '/add <wallet_address> - Add wallet to monitor\n' +
                '/remove <wallet_address> - Remove wallet from monitoring\n' +
                '/list - Show monitored wallets\n' +
                '/stats - Show connection statistics\n' +
                '/help - Show this help message'
            );
        });

        this.bot.command('add', async (ctx) => {
            const userId = ctx.from!.id;
            const walletAddress = ctx.match?.trim();

            if (!walletAddress) {
                return ctx.reply('Please provide a wallet address: /add <wallet_address>');
            }

            if (this.isValidSolanaAddress(walletAddress)) {
               await this.subscriptionsPool.addWalletToPool(walletAddress, userId);
                await ctx.reply(`✅ Added wallet ${walletAddress} to monitoring list.`);
            } else {
                await ctx.reply('❌ Invalid Solana wallet address format.');
            }
        });

        this.bot.command('remove', async (ctx) => {
            const walletAddress = ctx.match?.trim();

            if (!walletAddress) {
                return await ctx.reply('Please provide a wallet address: /remove <wallet_address>');
            }
            await ctx.reply(`✅ Removed wallet ${walletAddress} from monitoring list.`);
        });

        this.bot.command('stats', (ctx) => {

            ctx.reply(
                `📊 Bot Statistics:\n\n` +
                `👥 Total Users: 1\n` +
                `👛 Total Wallets: 1\n` +
                `🔗 Active Connections: 1/1\n` +
                `📡 Wallets per Connection: 1`
            );
        });

        // List wallets command
        this.bot.command('list', (ctx) => {
            await ctx.reply(`📋 Your monitored wallets:\n\n${'...'}`);
        });

        // Help command
        this.bot.command('help', (ctx) => {
            await ctx.reply(
                'Solana Wallet Monitor Commands:\n\n' +
                '/add <wallet_address> - Add wallet to monitor\n' +
                '/remove <wallet_address> - Remove wallet from monitoring\n' +
                '/list - Show monitored wallets\n' +
                '/help - Show this help message\n\n' +
                'The bot will notify you about all transactions for monitored wallets.'
            );
        });

        // Error handling
        this.bot.catch((err) => {
            const ctx = err.ctx;
            console.error(`Error while handling update ${ctx.update.update_id}:`);
            const e = err.error;

            if (e instanceof GrammyError) {
                console.error('Error in request:', e.description);
            } else if (e instanceof HttpError) {
                console.error('Could not contact Telegram:', e);
            } else {
                console.error('Unknown error:', e);
            }
        });
    }

    async start() {
        try {
            console.log('Starting Solana Wallet Monitor Bot...');

            await this.bot.start();
            console.log('Bot started successfully!');
        } catch (error) {
            console.error('Error starting bot:', error);
        }
    }

    async stop() {
        try {
            await this.bot.stop();
            console.log('Bot stopped successfully!');
        } catch (error) {
            console.error('Error stopping bot:', error);
        }
    }

    public isValidSolanaAddress(address: string): boolean {
        try {
            const pubKey = new PublicKey(address);
            return PublicKey.isOnCurve(pubKey.toBuffer());
        } catch (e) {
            return false;
        }
    }
}
