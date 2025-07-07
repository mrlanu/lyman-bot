import type SolanaWalletMonitor from '../solanaWalletMonitor';
import type { MyContext } from '../types';

export default function registerMonitor(bot: SolanaWalletMonitor) {
    const b = bot.getBot();
    const monitors = bot.getMonitors();
    b.command('monitor', async (ctx: MyContext) => {
        const args = ctx.message?.text?.split(' ').slice(1);
        if (!args || args.length === 0) {
            await ctx.reply(
                '❌ Please provide a wallet address\\.\n\nExample: `/monitor So11111111111111111111111111111111111111112`',
                { parse_mode: 'MarkdownV2' },
            );
            return;
        }
        const walletAddress = args.join(' ').trim();
        if (bot.isValidSolanaAddress(walletAddress)) {
            const monitorKey = `${ctx.chat!.id}_${walletAddress}`;
            if (monitors.has(monitorKey)) {
                await ctx.reply('⚠️ This wallet is already being monitored!', { parse_mode: 'MarkdownV2' });
                return;
            }
            monitors.set(monitorKey, {
                chatId: ctx.chat!.id,
                walletAddress,
            });
            if (!ctx.session.monitoredWallets.includes(walletAddress)) {
                ctx.session.monitoredWallets.push(walletAddress);
            }
            bot.ensureMonitoring();
            await ctx.reply(
                `✅ *Started monitoring wallet:*\n\`${bot.escapeMarkdown(walletAddress)}\`\n\n` +
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
}
