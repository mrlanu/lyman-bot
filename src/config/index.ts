import dotenv from "dotenv";
dotenv.config({ path: '../.env' });

export const config = {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
    rpcUrl: process.env.RPC_ADDRESS || "https://api.devnet.solana.com",
};
