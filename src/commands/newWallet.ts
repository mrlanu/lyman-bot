import {Keypair, LAMPORTS_PER_SOL, PublicKey} from '@solana/web3.js';
import type SolanaWalletMonitor from '../solanaWalletMonitor';
import type { MyContext } from '../types';

export default function createNewWallet(bot: SolanaWalletMonitor) {
    const b = bot.getBot();
    const connection = bot.getConnection();
    b.command('new_wallet', async (ctx: MyContext) => {
        // Generate new Keypair (wallet)
        const keypair = Keypair.generate();

        console.log("Public Key:", keypair.publicKey.toBase58());
        console.log("Secret Key:", Buffer.from(keypair.secretKey).toString("hex"));

        // Optional: Request Airdrop to fund the wallet
        const airdropSignature = await connection.requestAirdrop(
            keypair.publicKey,
            LAMPORTS_PER_SOL  // 1 SOL
        );

        await connection.confirmTransaction(airdropSignature, "confirmed");

        console.log("Airdrop complete! Wallet funded on Devnet.");
    });
}
