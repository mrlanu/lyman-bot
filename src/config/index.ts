import dotenv from "dotenv";
dotenv.config({ path: '../.env' });

export const config = {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
    rpcUrl: process.env.RPC_ADDRESS || "https://api.devnet.solana.com",
    maxWsConnections: parseInt(process.env.WALLETS_PER_CONNECTION ?? '100'),
    maxConnections: parseInt(process.env.MAX_WS_CONNECTIONS ?? '10'),
};
