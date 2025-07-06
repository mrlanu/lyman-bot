import { PublicKey } from '@solana/web3.js';
import type SolanaWalletMonitor from '../solanaWalletMonitor';
import type { MyContext } from '../types';

export default function registerDetectWallet(bot: SolanaWalletMonitor) {
    bot.getBot().on('message:text', async (ctx: MyContext) => {
        const text = ctx.message.text.trim();
        if (text.length >= 32 && text.length <= 44 && /^[A-Za-z0-9]+$/.test(text)) {
            try {
                new PublicKey(text);
                await ctx.reply(
                    `🔍 *Detected wallet address!*\n\nTo monitor this wallet, use:\n/monitor ${text}`,
                    { parse_mode: 'MarkdownV2' },
                );
            } catch {
                // ignore
            }
        }
    });
}
