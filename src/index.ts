import { config } from 'dotenv';
import SolanaWalletMonitor from './solanaWalletMonitor';

// Load environment variables
config({ path: '../.env' });

const bot = new SolanaWalletMonitor();

process.once('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
});

process.once('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await bot.stop();
    process.exit(0);
});

bot.start().catch(console.error);
