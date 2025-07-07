import type SolanaWalletMonitor from '../solanaWalletMonitor';
import type {MyContext} from '../types';

export default function registerList(bot: SolanaWalletMonitor) {
    const b = bot.getBot();
    const monitors = bot.getMonitors();
    b.command('list', async (ctx: MyContext) => {
        const userMonitors = Array.from(monitors.values()).filter((m) => m.chatId === ctx.chat!.id);
        if (userMonitors.length === 0) {
            await ctx.reply('📝 No wallets are currently being monitored\\.');
            return;
        }
        const walletList = userMonitors
            .map((m, i) => `${i + 1}\\. \`${bot.escapeMarkdown(m.walletAddress)}\``)
            .join('\n');
        await ctx.reply(`📝 *Monitored wallets:*\n\n${walletList}`, {parse_mode: 'MarkdownV2'});
    });
}
