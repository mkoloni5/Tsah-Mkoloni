import { WASocket } from '@whiskeysockets/baileys';
import { isEnabled } from '../utils/settings.js';

export const startAutoBio = (sock: WASocket) => {
    const sessionId = (sock as any).sessionId || 'default_bot';
    setInterval(async () => {
        try {
            if (await isEnabled('auto_bio', sessionId)) {
                const date = new Date();
                const time = date.toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' });
                const bio = `Tsah_Mkolo | 🕒 ${time} | Always active 🤖`;
                await sock.updateProfileStatus(bio);
                console.log('Bio updated:', bio);
            }
        } catch (error) {
            console.error('Auto Bio Error:', error);
        }
    }, 60000); // Every minute
};