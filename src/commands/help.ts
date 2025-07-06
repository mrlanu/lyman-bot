import type SolanaWalletMonitor from '../solanaWalletMonitor';
import type { MyContext } from '../types';

export default function registerHelp(bot: SolanaWalletMonitor) {
    bot.getBot().command('help', async (ctx: MyContext) => {
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
}
