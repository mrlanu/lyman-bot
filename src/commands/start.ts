import type SolanaWalletMonitor from '../solanaWalletMonitor';
import type { MyContext } from '../types';

export default function registerStart(bot: SolanaWalletMonitor) {
    bot.getBot().command('start', async (ctx: MyContext) => {
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
}
