import {LymanBot} from "./lyman-bot";

async function main() {

    const monitor = new LymanBot();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        await monitor.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\nReceived SIGTERM, shutting down gracefully...');
        await monitor.stop();
        process.exit(0);
    });

    // Start the monitoring service
    await monitor.start();
}

main().catch(console.error);
