import type SolanaWalletMonitor from '../solanaWalletMonitor';
import type { MyContext } from '../types';

export default function registerStop(bot: SolanaWalletMonitor) {
    const b = bot.getBot();
    const monitors = bot.getMonitors();
    b.command('stop', async (ctx: MyContext) => {
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
        if (monitors.has(monitorKey)) {
            monitors.delete(monitorKey);
            ctx.session.monitoredWallets = ctx.session.monitoredWallets.filter((addr: string) => addr !== walletAddress);
            await ctx.reply(`✅ *Stopped monitoring wallet:*\n\`${bot.escapeMarkdown(walletAddress)}\``, {
                parse_mode: 'MarkdownV2',
            });
        } else {
            await ctx.reply('❌ This wallet is not being monitored.', { parse_mode: 'MarkdownV2' });
        }
    });
}
