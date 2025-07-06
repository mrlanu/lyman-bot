import { PublicKey } from '@solana/web3.js';
import type SolanaWalletMonitor from '../solanaWalletMonitor';
import type { MyContext } from '../types';

export default function registerBalance(bot: SolanaWalletMonitor) {
    const b = bot.getBot();
    const connection = bot.getConnection();
    b.command('balance', async (ctx: MyContext) => {
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
            const balanceLamports = await connection.getBalance(publicKey);
            const balanceSol = balanceLamports / 1_000_000_000;
            ctx.reply(`💰 Wallet Balance: *${bot.escapeMarkdown(balanceSol.toString())} SOL*`, {
                parse_mode: 'MarkdownV2',
            });
        } catch (error) {
            console.error(error);
            ctx.reply('❌ Failed to fetch balance. Please try again later.', { parse_mode: 'MarkdownV2' });
        }
    });
}
