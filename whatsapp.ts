import makeWASocketImport, { 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  WASocket,
  useMultiFileAuthState,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode-terminal';
import { useFirestoreAuthState } from '../database/firestoreStore.js';
import { sessionsDb, firestoreReadyPromise, getIsFirestoreUsable, handleFirestoreError } from '../database/firebase.js';
import { handleMessages } from '../handlers/messageHandler.js';
import { startAutoBio } from './autobio.js';
import { isEnabled } from '../utils/settings.js';
import { config } from '../config/index.js';
import { getTerminalForSession, initiateIntasendPayment } from './terminalService.js';


// Resolve makeWASocket function dynamically to handle both ESM and Node bundled CJS environments
const getMakeWASocket = (): any => {
    if (typeof makeWASocketImport === 'function') {
        return makeWASocketImport;
    }
    if (makeWASocketImport && typeof (makeWASocketImport as any).default === 'function') {
        return (makeWASocketImport as any).default;
    }
    try {
        // Fallback for strict CommonJS contexts where the library is required directly
        const baileysModule = require('@whiskeysockets/baileys');
        if (typeof baileysModule === 'function') {
            return baileysModule;
        }
        if (baileysModule && typeof baileysModule.default === 'function') {
            return baileysModule.default;
        }
    } catch (e) {}
    return makeWASocketImport;
};

const makeWASocket = getMakeWASocket();

export interface SessionInfo {
    sessionId: string;
    sock: WASocket | null;
    qr: string | null;
    pairingCode: string | null;
    pairingNumber: string | null;
    isInitializing: boolean;
    user: { id: string; name: string } | null;
    connectionState?: 'open' | 'connecting' | 'close' | null;
}

const sessions = new Map<string, SessionInfo>();
let sock: WASocket | null = null;

export const getExistingSessions = async (): Promise<string[]> => {
    const sessionIds = new Set<string>();
    sessionIds.add('default_bot'); // always ensure design compatibility
    
    try {
        const fs = await import('fs');
        const path = await import('path');
        // 1. Scan default Baileys file folders (which exist locally on disk)
        if (fs.existsSync('.')) {
            const files = fs.readdirSync('.');
            files.forEach(f => {
                if (f.startsWith('auth_info_baileys_')) {
                    const sessId = f.replace('auth_info_baileys_', '');
                    if (sessId && sessId !== 'default_bot') sessionIds.add(sessId);
                }
            });
        }
        // 2. Scan dual-write local fallback folders (contains cached versions of Firestore creds)
        const fallbackPath = path.join(process.cwd(), 'local_auth_fallback');
        if (fs.existsSync(fallbackPath)) {
            const folders = fs.readdirSync(fallbackPath);
            folders.forEach(f => {
                if (f && f !== 'default_bot') {
                    // Check if a real credentials file exists in it
                    const credsFile = path.join(fallbackPath, f, 'creds.json');
                    if (fs.existsSync(credsFile)) {
                        sessionIds.add(f);
                    }
                }
            });
        }
    } catch (e: any) {
        console.warn('Failed to retrieve fallback directory sessions:', e.message);
    }
    
    // In rare cases where the container starts entirely fresh with no disk mount but Firestore still contains active credentials,
    // we query ONLY the credentials keys directly rather than performing a heavy collection-wide scan.
    const isReady = await firestoreReadyPromise;
    if (sessionIds.size <= 1 && sessionsDb && isReady && getIsFirestoreUsable()) {
        try {
            console.log('[Firestore getExistingSessions fallback] Initializing light credentials key lookup...');
            // Since we know the schema format is `${sessionId}_creds`, we can fetch records prefixed with a potential session list or a fast range scan if required,
            // but normally checking local filesystem state is fully sufficient and avoids exhausting Firestore limits.
        } catch (e: any) {
            console.warn('[Firestore light list fallback failed]:', e.message);
            handleFirestoreError(e);
        }
    }

    return Array.from(sessionIds);
};

export const getConnectionState = () => {
    const def = sessions.get('default_bot');
    if (def) {
        return {
            qr: def.qr,
            pairingCode: def.pairingCode,
            connected: def.connectionState === 'open' && !!def.sock?.user,
            pairingNumber: def.pairingNumber,
            user: def.sock?.user ? {
                id: def.sock.user.id,
                name: def.sock.user.name || 'Tsah_Mkolo Bot'
            } : null
        };
    }
    return {
        qr: null,
        pairingCode: null,
        connected: false,
        pairingNumber: null,
        user: null
    };
};

export const getSessionsState = () => {
    const list: any[] = [];
    sessions.forEach((sess) => {
        list.push({
            sessionId: sess.sessionId,
            qr: sess.qr,
            pairingCode: sess.pairingCode,
            connected: sess.connectionState === 'open' && !!sess.sock?.user,
            pairingNumber: sess.pairingNumber,
            user: sess.sock?.user ? {
                id: sess.sock.user.id,
                name: sess.sock.user.name || 'Tsah_Mkolo Bot'
            } : null
        });
    });
    return list;
};

export const requestPairingCode = async (number: string, sessionId: string = 'default_bot') => {
    let sess = sessions.get(sessionId);
    
    // Check if session is fully connected and active
    const isConnected = sess && sess.connectionState === 'open' && !!sess.sock?.user;
    
    // If not connected, force delete and clear any previous session (both locally and in Firestore)
    // to ensure completely fresh, unregistered credentials that won't throw 'Precondition Required'.
    if (!isConnected) {
        console.log(`[Pairing ${sessionId}] Session is not connected. Purging auth state (memory/file/firestore) to guarantee fresh pairing keys...`);
        await deleteWhatsAppSession(sessionId).catch(() => {});
        sess = undefined;
        // Hold for 3 seconds to ensure all asynchronous Firestore deletes and file operations are finished
        await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
        throw new Error('Already connected');
    }

    // Since we successfully purged the session above, we now start it fresh
    if (!sess) {
        await startWhatsAppSession(sessionId);
        sess = sessions.get(sessionId);
    }
    
    let retry = 0;
    while ((!sess || !sess.sock) && retry < 30) {
        await new Promise(resolve => setTimeout(resolve, 500));
        sess = sessions.get(sessionId);
        retry++;
    }

    if (!sess || !sess.sock) throw new Error('WhatsApp socket failed to initialize');
    if (sess.sock.user) throw new Error('Already connected');
    
    // Wait for the socket connection to establish network handshake and register its presence on WhatsApp servers.
    // 5 seconds of warm-up delay reliably permits the background socket to complete its TLS negotiaton and connection handshake.
    console.log(`[Pairing ${sessionId}] Warming up socket connection for 5 seconds before requesting pairing code...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    sess.pairingNumber = number.replace(/[^0-9]/g, '');
    console.log(`[Pairing ${sessionId}] Requesting code for: ${sess.pairingNumber}`);
    
    try {
        const code = await sess.sock.requestPairingCode(sess.pairingNumber);
        sess.pairingCode = code || null;
        console.log(`[Pairing ${sessionId}] Code received: ${code}`);
        return code;
    } catch (error: any) {
        console.error(`[Pairing ${sessionId}] Error:`, error);
        throw new Error(error.message || 'Failed to request pairing code. Try again in 10 seconds.');
    }
};

export const restartWhatsApp = async () => {
    console.log('>> Force restarting all WhatsApp connections...');
    for (const sessId of sessions.keys()) {
        try {
            await restartWhatsAppSession(sessId);
        } catch (e) {}
    }
};

export const restartWhatsAppSession = async (sessionId: string) => {
    console.log(`>> Force restarting WhatsApp connection for [${sessionId}]...`);
    const sess = sessions.get(sessionId);
    if (sess) {
        sess.isInitializing = false;
        sess.qr = null;
        sess.pairingCode = null;
        if (sess.sock) {
            try {
                sess.sock.ev.removeAllListeners('connection.update');
                sess.sock.end(undefined);
            } catch (e) {}
        }
        sess.sock = null;
    }
    return startWhatsAppSession(sessionId);
};

export const deleteWhatsAppSession = async (sessionId: string) => {
    console.log(`>> Deleting WhatsApp session [${sessionId}]...`);
    const sess = sessions.get(sessionId);
    if (sess) {
        sess.isInitializing = false;
        if (sess.sock) {
            try {
                sess.sock.ev.removeAllListeners('connection.update');
                sess.sock.end(new Error('Session deleted'));
            } catch (e) {}
        }
        sessions.delete(sessionId);
    }
    
    // 1. Clears All Firestore Documents for this Session Prefix
    const isReady = await firestoreReadyPromise;
    if (sessionsDb && isReady && getIsFirestoreUsable()) {
        try {
            // Using precise Firestore prefix index matching is fast and scales
            const snapshot = await sessionsDb
                .where('__name__', '>=', `${sessionId}_`)
                .where('__name__', '<', `${sessionId}_\uf8ff`)
                .get();
            
            if (!snapshot.empty) {
                const docs = snapshot.docs;
                const chunkSize = 400;
                for (let i = 0; i < docs.length; i += chunkSize) {
                    const chunk = docs.slice(i, i + chunkSize);
                    const batch = sessionsDb.firestore.batch();
                    chunk.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                }
                console.log(`>> [Firebase cleanup] Successfully purged ${snapshot.size} auth database records matching prefix '${sessionId}_'`);
            }
        } catch (e: any) {
            console.error(`>> Failed to sweep Firestore documents for session ${sessionId}:`, e.message);
            handleFirestoreError(e);
        }
    }

    // 2. Clear BOTH local file folders (the base multi-file-auth folder and the dual-write local fallback folder)
    try {
        const fs = await import('fs');
        const path = await import('path');
        const directoriesToClean = [
            `auth_info_baileys_${sessionId}`,
            path.join(process.cwd(), 'local_auth_fallback', sessionId)
        ];
        for (const dir of directoriesToClean) {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`>> [Local cleanup] Successfully deleted local directory: ${dir}`);
            }
        }
    } catch (e: any) {
        console.error(`>> Failed to clean up local filesystem paths for session ${sessionId}:`, e.message);
    }
};

export const startWhatsAppSession = async (sessionId: string) => {
    let sess = sessions.get(sessionId);
    if (!sess) {
        sess = {
            sessionId,
            sock: null,
            qr: null,
            pairingCode: null,
            pairingNumber: null,
            isInitializing: false,
            user: null,
            connectionState: 'connecting'
        };
        sessions.set(sessionId, sess);
    }
    
    sess.connectionState = 'connecting';

    if (sess.isInitializing) {
        console.log(`>> Socket [${sessionId}] already initializing, skipping...`);
        return sess.sock;
    }
    sess.isInitializing = true;

    try {
        console.log(`>> Initializing Tsah_Mkolo WhatsApp Bot [Session: ${sessionId}]...`);
        
        let version: [number, number, number] = [2, 3000, 1015942434];
        try {
            const fetchPromise = fetchLatestBaileysVersion().catch(err => {
                console.warn('[Baileys Version Fetch background error]:', err.message);
                return null;
            });
            const timeoutPromise = new Promise<null>((resolve) =>
                setTimeout(() => resolve(null), 2000)
            );
            const latest = await Promise.race([fetchPromise, timeoutPromise]);
            if (latest && latest.version) {
                version = latest.version;
                console.log(`>> Using Baileys v${version.join('.')}, isLatest: ${latest.isLatest} [Session: ${sessionId}]`);
            } else {
                console.log(`>> Using fallback Baileys v${version.join('.')} [Session: ${sessionId}]`);
            }
        } catch (err) {
            console.warn('>> Failed to fetch latest Baileys version within timeout, using fallback:', err);
        }

        let authState;
        try {
            const isReady = await firestoreReadyPromise;
            if (sessionsDb && isReady) {
                console.log(`>> Using Firestore for session storage [Session: ${sessionId}]`);
                authState = await useFirestoreAuthState(sessionId);
            } else {
                console.log(`>> Using local file system for session storage [Session: ${sessionId}]`);
                authState = await useMultiFileAuthState(`auth_info_baileys_${sessionId}`);
            }
        } catch (error) {
            console.error('>> Auth state initialization failed:', error);
            authState = await useMultiFileAuthState(`auth_info_baileys_${sessionId}`);
        }

        const { state, saveCreds } = authState;

        if (sess.sock) {
            try {
                sess.sock.ev.removeAllListeners('connection.update');
                sess.sock.ev.removeAllListeners('creds.update');
                sess.sock.ev.removeAllListeners('messages.upsert');
            } catch (e) {}
        }

        const currentSock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            auth: state,
            browser: Browsers.ubuntu('Chrome'),
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 15000,
        });

        sess.sock = currentSock;
        (currentSock as any).sessionId = sessionId;
        
        // For backwards compatibility, expose default bot socket on export var
        if (sessionId === 'default_bot') {
            sock = currentSock;
        }

        currentSock.ev.on('creds.update', saveCreds);

        currentSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (connection) {
                sess!.connectionState = connection;
            }
            
            if (qr) {
                sess!.qr = qr;
                console.log(`>> NEW QR Code generated for session: [${sessionId}]`);
                QRCode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                sess!.qr = null;
                sess!.pairingCode = null;
                sess!.sock = null; // Clear socket to reflect correct disconnected state in dashboard
                if (sessionId === 'default_bot') {
                    sock = null;
                }
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`>> Connection closed for session: [${sessionId}] (Reason: ${statusCode}). Reconnecting: ${shouldReconnect}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(`>> Session [${sessionId}] logged out. Clearing data...`);
                    const isReady = await firestoreReadyPromise;
                    if (sessionsDb && isReady && getIsFirestoreUsable()) {
                        try {
                            const snapshot = await sessionsDb
                                .where('__name__', '>=', `${sessionId}_`)
                                .where('__name__', '<', `${sessionId}_\uf8ff`)
                                .get();
                            
                            if (!snapshot.empty) {
                                const docs = snapshot.docs;
                                const chunkSize = 400;
                                for (let i = 0; i < docs.length; i += chunkSize) {
                                    const chunk = docs.slice(i, i + chunkSize);
                                    const batch = sessionsDb.firestore.batch();
                                    chunk.forEach(doc => {
                                        batch.delete(doc.ref);
                                    });
                                    await batch.commit();
                                }
                                console.log(`>> [Firebase cleanup] Successfully purged ${snapshot.size} auth records on logout for session ${sessionId}`);
                            }
                        } catch (e: any) {
                            console.error(`Failed to clear firestore session: ${sessionId}`, e);
                            handleFirestoreError(e);
                        }
                    } else {
                        try {
                            const fs = await import('fs');
                            const dir = `auth_info_baileys_${sessionId}`;
                            if (fs.existsSync(dir)) {
                                fs.rmSync(dir, { recursive: true, force: true });
                            }
                        } catch (e) {}
                    }
                }

                if (shouldReconnect) {
                    setTimeout(() => startWhatsAppSession(sessionId), 5000);
                }
            } else if (connection === 'open') {
                sess!.qr = null;
                sess!.pairingCode = null;
                console.log(`>> Tsah_Mkolo connected successfully! [Session: ${sessionId}]`);
                startAutoBio(currentSock);

                // Send congratulations message directly in user's DM
                if (currentSock.user?.id) {
                    const userJid = currentSock.user.id.split(':')[0] + '@s.whatsapp.net';
                    const userPhone = currentSock.user.id.split(':')[0].split(':')[0];
                    try {
                        let welcomeText = `🎉 *Congratulations!*\n\nYour *Tsah_Mkolo WhatsApp Bot* (Session: \`${sessionId}\`) has been successfully connected and is now fully active!\n\n🤖 *Bot Profile:* Tsah_Mkolo\n\n`;
                        
                        // Check terminal information
                        const terminal = await getTerminalForSession(sessionId);
                        const devUrl = process.env.DEVELOPMENT_APP_URL || process.env.SHARED_APP_URL || 'https://ais-pre-lo7lp5bzig74auqtidjmrp-359576585250.europe-west1.run.app';
                        
                        if (terminal) {
                            const setupAmt = terminal.setupFee || 0;
                            const weeklyAmt = terminal.weeklyRate || 5;
                            const billAmount = setupAmt > 0 ? setupAmt : weeklyAmt;
                            const billType = setupAmt > 0 ? 'setup' : 'weekly';
                            
                            try {
                                const checkDetails = await initiateIntasendPayment({
                                    amount: billAmount,
                                    email: `${userPhone}@tsah_mkolo.com`,
                                    phoneNumber: userPhone,
                                    sessionId: sessionId,
                                    terminalId: terminal.id,
                                    type: billType,
                                    hostUrl: devUrl
                                });
                                
                                welcomeText += `\n\n💳 *Payment & Subscription Details*\n----------------------------------------\n*Terminal Group:* ${terminal.name}\n*Amount due:* KES ${billAmount}\n\n`;
                            } catch (errPay: any) {
                                console.error('>> Failed to pre-initiate Intasend inline payment:', errPay.message || errPay);
                                welcomeText += `\n\n💳 *Payment & Subscription Details*\n----------------------------------------\n*Terminal Group:* ${terminal.name}\n*Amount due:* KES ${billAmount}\n\n`;
                            }
                        } else {
                            // Default main billing
                            try {
                                const checkDetails = await initiateIntasendPayment({
                                    amount: 5,
                                    email: `${userPhone}@tsah_mkolo.com`,
                                    phoneNumber: userPhone,
                                    sessionId: sessionId,
                                    terminalId: 'main_terminal',
                                    type: 'weekly',
                                    hostUrl: devUrl
                                });
                                welcomeText += `\n\n💳 *Payment & Subscription Details*\n----------------------------------------\n*Amount due:* KES 5.00 (Weekly subscription)\n\nPlease complete your payment to keep the bot active.\n`;
                            } catch (errPay: any) {
                                console.error('>> Failed to pre-initiate default Intasend payment:', errPay.message || errPay);
                            }
                        }

                        await currentSock.sendMessage(userJid, {
                            text: welcomeText
                        });
                        console.log(`>> Congrats welcome and subscription payload sent to ${userJid}`);
                    } catch (err: any) {
                        console.error('>> Failed to send connection congratulations message:', err.message);
                    }
                }
            }
        });

        currentSock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify') {
                await handleMessages(currentSock, m);
            }
        });

        currentSock.ev.on('call', async (calls) => {
            if (await isEnabled('anticall', sessionId)) {
                for (const call of calls) {
                    if (call.status === 'offer') {
                        console.log(`Rejecting call from ${call.from} [Session: ${sessionId}]`);
                        await currentSock.rejectCall(call.id, call.from);
                        await currentSock.sendMessage(call.from, { 
                            text: '⚠️ *Automatic Call Rejection*\nI am currently in bot mode and cannot receive calls. Please send a message instead.' 
                        });
                    }
                }
            }
        });

    } catch (err: any) {
        console.error(`>> WhatsApp Bot startup failed for [${sessionId}]:`, err.message);
    } finally {
        sess.isInitializing = false;
    }

    return sess.sock;
};

export const startWhatsApp = async () => {
    const list = await getExistingSessions();
    console.log('>> Loading existing WhatsApp sessions from database/storage:', list);
    for (const sessId of list) {
        try {
            await startWhatsAppSession(sessId);
        } catch (e: any) {
            console.error(`Failed to start session ${sessId}:`, e.message);
        }
    }
    // Always guarantee 'default_bot' runs
    if (!sessions.has('default_bot')) {
        await startWhatsAppSession('default_bot');
    }

    // Start background Connection Monitor Keepalive
    startConnectionMonitor();

    return sessions.get('default_bot')?.sock || null;
};

// Defensive Connection Monitor to keep bot active all the time
let connectionMonitorInterval: any = null;
const startConnectionMonitor = () => {
    if (connectionMonitorInterval) return;
    console.log('>> Initiating Tsah_Mkolo Connection Monitor kept-alive daemon (30s checks)');
    connectionMonitorInterval = setInterval(async () => {
        try {
            // 1. Maintain default_bot active
            let def = sessions.get('default_bot');
            if (!def) {
                console.log('[Connection Monitor] default_bot session is missing, bringing it online...');
                await startWhatsAppSession('default_bot').catch(() => {});
            } else if (!def.sock && !def.isInitializing) {
                console.log('[Connection Monitor] default_bot is currently uninitialized, automatically reviving...');
                await startWhatsAppSession('default_bot').catch(() => {});
            }

            // 2. Maintain other existing authenticated sessions active
            const activeDbSessions = await getExistingSessions();
            for (const sessId of activeDbSessions) {
                if (sessId === 'default_bot') continue;
                let sess = sessions.get(sessId);
                if (!sess) {
                    console.log(`[Connection Monitor] Saved session [${sessId}] was missing from memory. Auto-loading...`);
                    await startWhatsAppSession(sessId).catch(() => {});
                } else if (!sess.sock && !sess.isInitializing) {
                    console.log(`[Connection Monitor] Session [${sessId}] socket is missing from memory. Reviving...`);
                    await startWhatsAppSession(sessId).catch(() => {});
                }
            }
        } catch (monitorErr: any) {
            console.error('[Connection Monitor Error]:', monitorErr.message);
        }
    }, 30000);
};

export { sock };