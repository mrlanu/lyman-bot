import type SolanaWalletMonitor from '../solanaWalletMonitor';

export default function registerErrorHandler(bot: SolanaWalletMonitor) {
    bot.getBot().catch((err: unknown) => {
        console.error('Grammy error:', err);
    });
}
