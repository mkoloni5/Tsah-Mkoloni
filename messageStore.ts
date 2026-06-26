import { proto } from '@whiskeysockets/baileys';

interface CachedMessage {
    message: proto.IMessage;
    sender: string;
    timestamp: number;
}

const messageCache = new Map<string, CachedMessage>();

export const storeMessage = (id: string, sender: string, message: proto.IMessage) => {
    messageCache.set(id, {
        message,
        sender,
        timestamp: Date.now()
    });
    
    // Cleanup old messages every hour
    if (messageCache.size > 1000) {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const [key, value] of messageCache.entries()) {
            if (value.timestamp < oneHourAgo) {
                messageCache.delete(key);
            }
        }
    }
};

export const getMessage = (id: string) => {
    return messageCache.get(id);
};
