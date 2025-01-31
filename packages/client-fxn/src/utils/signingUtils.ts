import {
    Keypair,
    PublicKey
} from "@solana/web3.js";
import bs58 from 'bs58';
import { Buffer } from 'buffer';
import nacl from 'tweetnacl';
import { BroadcastPayload } from "../fxnClient";

export interface SignedMessage {
    payload: BroadcastPayload,
    signature: string,
    publicKey: string
}

// Sender service
export async function signMessage(keypair: Keypair, payload: BroadcastPayload): Promise<SignedMessage> {
    try {
        // Convert payload to buffer
        const payloadBuffer = Buffer.from(JSON.stringify(payload));

        // Sign the message
        const signature = nacl.sign.detached(
            payloadBuffer,
            keypair.secretKey
        );

        return {
            payload,
            signature: bs58.encode(signature),
            publicKey: keypair.publicKey.toBase58()
        };
    } catch (error) {
        throw new Error(`Failed to sign message: ${error.message}`);
    }
}

// Receiver service
export async function verifyMessage(message: SignedMessage) {
    try {
        // Convert signature back to Uint8Array
        const signatureUint8 = bs58.decode(message.signature);

        // Convert payload to buffer
        const payloadBuffer = Buffer.from(
            JSON.stringify(message.payload)
        );

        // Convert public key string to PublicKey object
        const publicKey = new PublicKey(message.publicKey);

        // Verify the signature
        const isValid = nacl.sign.detached.verify(
            payloadBuffer,
            signatureUint8,
            publicKey.toBytes()
        );

        return {
            isValid,
            publicKey: message.publicKey,
            originalPayload: message.payload
        };
    } catch (error) {
        throw new Error(`Failed to verify message: ${error.message}`);
    }
}
