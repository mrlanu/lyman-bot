import {LymanBot} from "./lyman-bot";

const bot = new LymanBot();

async function main() {

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await bot.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM, shutting down gracefully...');
        await bot.stop();
        process.exit(0);
    });

    // Start the monitoring service
    await bot.start();
}

main().catch(console.error);
