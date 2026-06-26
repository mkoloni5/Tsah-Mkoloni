import { terminalsDb, paymentsDb, premiumDb, settingsDb, getIsFirestoreUsable, handleFirestoreError } from '../database/firebase.js';
import admin from 'firebase-admin';
import axios from 'axios';

export interface Terminal {
  id: string;
  name: string;
  operatorName: string;
  weeklyRate: number;      // default e.g. 5 KES
  setupFee: number;        // first time payment e.g. 10 KES
  createdAt: number;
  sessionIds: string[];    // list of bot session IDs connected to this terminal
}

export interface PaymentTransaction {
  id: string;              // IntaSend tracking ID/invoice ID/checkout ID (our generated ref_)
  intasendInvoiceId?: string; // IntaSend's returned invoice/tracking ID if successful
  payheroReference?: string;  // Pay Hero returned token/reference if successful
  sessionId: string;
  terminalId: string;
  phoneNumber: string;
  amount: number;
  type: 'setup' | 'weekly';
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
}

// In-memory fallback backup databases for high-availability / quota-exhausted environments
const inMemoryTerminals = new Map<string, Terminal>();
const inMemoryPayments = new Map<string, PaymentTransaction>();

// Initialize default terminal for seamless operations if needed
const DEFAULT_TERMINAL_ID = 'main_terminal';
inMemoryTerminals.set(DEFAULT_TERMINAL_ID, {
  id: DEFAULT_TERMINAL_ID,
  name: 'Default Danscom Terminal',
  operatorName: 'System Admin',
  weeklyRate: 5,
  setupFee: 0,
  createdAt: Date.now(),
  sessionIds: ['default_bot']
});

export const getPayheroConfig = () => {
  const apiKey = process.env.PAYHERO_API_KEY || '';
  const username = process.env.PAYHERO_API_USERNAME || '';
  const password = process.env.PAYHERO_API_PASSWORD || '';
  const channelId = process.env.PAYHERO_CHANNEL_ID || '1';
  const serviceId = process.env.PAYHERO_ACCOUNT_ID || '9178';
  const lipwaLink = process.env.PAYHERO_LIPWA_LINK || `https://lipwa.link/${serviceId}`;
  
  // Custom sandbox flag
  const isSandbox = !username || !password;
  
  return {
    apiKey,
    username,
    password,
    channelId,
    serviceId,
    lipwaLink,
    isSandbox
  };
};

export const getIntasendConfig = () => {
  const publicKey = process.env.INTASEND_PUBLIC_KEY || 'ISPubKey_sandbox_7a030ce6-9040-4da4-8ac9-8eabcfd0e650';
  const secretKey = process.env.INTASEND_SECRET_KEY || 'ISSecretKey_sandbox_00b0';
  
  // Auto-detect live mode: if INTASEND_IS_SANDBOX is explicitly "false",
  // or if INTASEND_IS_SANDBOX is not set but the public key does not have "sandbox" or has "live".
  // If no env is configured, default to sandbox
  const isSandbox = (process.env.INTASEND_IS_SANDBOX === 'true') || 
                    (!process.env.INTASEND_IS_SANDBOX && (!process.env.INTASEND_PUBLIC_KEY || publicKey.includes('_sandbox_')));
                    
  return {
    publicKey,
    secretKey,
    isSandbox
  };
};

let lastTerminalsFetch = 0;
let lastPaymentsFetch = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Get all terminals.
 */
export const getAllTerminals = async (): Promise<Terminal[]> => {
  const now = Date.now();
  if (now - lastTerminalsFetch < CACHE_TTL_MS && inMemoryTerminals.size > 0) {
    return Array.from(inMemoryTerminals.values());
  }

  if (getIsFirestoreUsable() && terminalsDb) {
    try {
      const snapshot = await terminalsDb.get();
      const list: Terminal[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as Terminal);
      });
      // Synchronize in-memory cache
      list.forEach(t => inMemoryTerminals.set(t.id, t));
      lastTerminalsFetch = now;
      return list;
    } catch (err: any) {
      console.warn('[TerminalService] Firestore getAllTerminals failed, using in-memory fallbacks:', err.message);
      handleFirestoreError(err);
    }
  }
  return Array.from(inMemoryTerminals.values());
};

/**
 * Get single terminal by ID.
 */
export const getTerminalById = async (id: string): Promise<Terminal | null> => {
  if (getIsFirestoreUsable() && terminalsDb) {
    try {
      const doc = await terminalsDb.doc(id).get();
      if (doc.exists) {
        const t = { id: doc.id, ...doc.data() } as Terminal;
        inMemoryTerminals.set(id, t);
        return t;
      }
    } catch (err: any) {
      console.warn(`[TerminalService] Firestore getTerminalById ${id} failed:`, err.message);
      handleFirestoreError(err);
    }
  }
  return inMemoryTerminals.get(id) || null;
};

/**
 * Create a new terminal.
 */
export const createTerminal = async (terminalData: Omit<Terminal, 'createdAt' | 'sessionIds'>): Promise<Terminal> => {
  const newTerminal: Terminal = {
    ...terminalData,
    createdAt: Date.now(),
    sessionIds: []
  };

  // Ensure lowercase clean ID
  newTerminal.id = newTerminal.id.toLowerCase().replace(/[^a-z0-9_]/g, '');

  if (getIsFirestoreUsable() && terminalsDb) {
    try {
      await terminalsDb.doc(newTerminal.id).set(newTerminal);
      console.log(`[TerminalService] Terminal created in Firestore: ${newTerminal.id}`);
    } catch (err: any) {
      console.warn('[TerminalService] Creating terminal in Firestore failed, storing in memory:', err.message);
      handleFirestoreError(err);
    }
  }

  inMemoryTerminals.set(newTerminal.id, newTerminal);
  lastTerminalsFetch = 0; // Invalidate cache
  return newTerminal;
};

/**
 * Associate a bot session to a terminal.
 */
export const addSessionToTerminal = async (terminalId: string, sessionId: string): Promise<void> => {
  const terminal = await getTerminalById(terminalId);
  if (!terminal) return;

  if (!terminal.sessionIds.includes(sessionId)) {
    terminal.sessionIds.push(sessionId);
    inMemoryTerminals.set(terminalId, terminal);
    lastTerminalsFetch = 0; // Invalidate cache

    if (getIsFirestoreUsable() && terminalsDb) {
      try {
        await terminalsDb.doc(terminalId).update({
          sessionIds: admin.firestore.FieldValue.arrayUnion(sessionId)
        });
      } catch (err: any) {
        console.warn(`[TerminalService] update sessionIds for terminal ${terminalId} failed:`, err.message);
        handleFirestoreError(err);
      }
    }
  }
};

/**
 * Initiates an IntaSend/PayHero transaction & checkout URL.
 */
export const initiateIntasendPayment = async (params: {
  amount: number;
  email: string;
  phoneNumber: string;
  sessionId: string;
  terminalId: string;
  type: 'setup' | 'weekly';
  hostUrl: string;
}): Promise<{ checkoutUrl: string; invoiceId: string }> => {
  const payhero = getPayheroConfig();
  const checkoutId = `ref_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  // Keep transaction record
  const transaction: PaymentTransaction = {
    id: checkoutId,
    sessionId: params.sessionId,
    terminalId: params.terminalId,
    phoneNumber: params.phoneNumber,
    amount: params.amount,
    type: params.type,
    status: 'pending',
    createdAt: Date.now()
  };

  inMemoryPayments.set(checkoutId, transaction);
  lastPaymentsFetch = 0; // Invalidate cache
  if (getIsFirestoreUsable() && paymentsDb) {
    try {
      await paymentsDb.doc(checkoutId).set(transaction);
    } catch (err: any) {
      console.warn('[TerminalService] Failed to save payment transaction to Firestore:', err.message);
      handleFirestoreError(err);
    }
  }

  // Sanitize phone number to Ken-style (e.g. 254...)
  let cleanPhone = params.phoneNumber.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '254' + cleanPhone.slice(1);
  } else if (!cleanPhone.startsWith('254') && cleanPhone.length === 9) {
    cleanPhone = '254' + cleanPhone;
  }

  // If live credentials are set, trigger an automatic M-pesa STK Push via Pay Hero
  if (!payhero.isSandbox) {
    try {
      const payload = {
        amount: params.amount,
        phone_number: cleanPhone,
        channel_id: payhero.channelId,
        service_id: payhero.serviceId,
        reference: checkoutId,
        callback_url: `${params.hostUrl}/api/payhero/callback`
      };

      console.log(`[PayHero] Initiating STK push via API endpoint... reference: ${checkoutId}`);
      const authHeader = 'Basic ' + Buffer.from(`${payhero.username}:${payhero.password}`).toString('base64');

      const apiResponse = await axios.post('https://backend.payhero.co.ke/api/v1/apps/express/new', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        timeout: 10000
      });

      if (apiResponse.data) {
        const payheroRef = apiResponse.data.reference || apiResponse.data.checkout_request_id || apiResponse.data.id;
        if (payheroRef) {
          const refStr = payheroRef.toString();
          transaction.payheroReference = refStr;
          inMemoryPayments.set(refStr, transaction);
          if (getIsFirestoreUsable() && paymentsDb) {
            await paymentsDb.doc(checkoutId).set(transaction);
            await paymentsDb.doc(refStr).set(transaction);
          }
        }
        console.log('[PayHero API] STK Push payload successfully routed and accepted.');
      }
    } catch (err: any) {
      console.warn('[PayHero STK Push Failed] Falling back directly to redirection link:', err.response?.data || err.message);
    }
  }

  // If credentials are live, return the real Pay Hero Lipwa Link checkout page
  if (!payhero.isSandbox) {
    const customLipwaUrl = `${payhero.lipwaLink}?amount=${params.amount}&phone=${cleanPhone}&reference=${checkoutId}`;
    return {
      checkoutUrl: customLipwaUrl,
      invoiceId: checkoutId
    };
  }

  // Absolute robust simulator fallback for smooth AI Studio user preview/testing when Keys are missing
  const gatewayUrl = `${params.hostUrl}?is_simulator=true&invoice_id=${checkoutId}&amount=${params.amount}&phone=${cleanPhone}`;
  return {
    checkoutUrl: gatewayUrl,
    invoiceId: checkoutId
  };
};

export const initiatePayheroPayment = initiateIntasendPayment;

/**
 * Verifies or changes the payment status. Sets the subscription to active if paid.
 */
export const verifyIntasendPayment = async (invoiceId: string): Promise<{ success: boolean; transaction: PaymentTransaction | null }> => {
  let transaction = inMemoryPayments.get(invoiceId);

  if (getIsFirestoreUsable() && paymentsDb) {
    try {
      const doc = await paymentsDb.doc(invoiceId).get();
      if (doc.exists) {
        transaction = doc.data() as PaymentTransaction;
      }
    } catch (e: any) {
      handleFirestoreError(e);
    }
  }

  // Backup support for finding by intasendInvoiceId or payheroReference fields in memory
  if (!transaction) {
    for (const tx of inMemoryPayments.values()) {
      if (tx.intasendInvoiceId === invoiceId || tx.payheroReference === invoiceId) {
        transaction = tx;
        break;
      }
    }
  }

  // Backup support in Firestore
  if (!transaction && getIsFirestoreUsable() && paymentsDb) {
    try {
      let snapshot = await paymentsDb.where('intasendInvoiceId', '==', invoiceId).limit(1).get();
      if (!snapshot.empty) {
        transaction = snapshot.docs[0].data() as PaymentTransaction;
      } else {
        snapshot = await paymentsDb.where('payheroReference', '==', invoiceId).limit(1).get();
        if (!snapshot.empty) {
          transaction = snapshot.docs[0].data() as PaymentTransaction;
        }
      }
    } catch (e: any) {
      handleFirestoreError(e);
    }
  }

  if (!transaction) {
    console.warn(`[TerminalService] verifyIntasendPayment: Transaction ${invoiceId} not found`);
    return { success: false, transaction: null };
  }

  const payhero = getPayheroConfig();
  let apiSuccess = (transaction.status === 'completed');

  const queryInvoiceId = transaction.payheroReference || transaction.intasendInvoiceId || transaction.id;

  // Only allow simulation fallback if isSandbox is true (testing mode)
  const allowSimulation = payhero.isSandbox;

  if (apiSuccess || (allowSimulation && (invoiceId.startsWith('ref_') || queryInvoiceId.startsWith('ref_')))) {
    transaction.status = 'completed';
    transaction.completedAt = Date.now();
    inMemoryPayments.set(transaction.id, transaction);
    
    if (transaction.intasendInvoiceId) {
      inMemoryPayments.set(transaction.intasendInvoiceId, transaction);
    }
    if (transaction.payheroReference) {
      inMemoryPayments.set(transaction.payheroReference, transaction);
    }
    
    lastPaymentsFetch = 0; // Invalidate cache

    if (getIsFirestoreUsable() && paymentsDb) {
      try {
        await paymentsDb.doc(transaction.id).set(transaction);
        if (transaction.intasendInvoiceId) {
          await paymentsDb.doc(transaction.intasendInvoiceId).set(transaction);
        }
        if (transaction.payheroReference) {
          await paymentsDb.doc(transaction.payheroReference).set(transaction);
        }
      } catch (e: any) {
        handleFirestoreError(e);
      }
    }

    // Activate the subscriber tier
    await activateSubscription(transaction.sessionId, transaction.type, transaction.amount);
    return { success: true, transaction };
  }

  return { success: false, transaction };
};

export const verifyPayheroPayment = verifyIntasendPayment;

/**
 * Activates or extends subscription for the session or connected phone number.
 */
export const activateSubscription = async (sessionId: string, type: 'setup' | 'weekly', amount: number) => {
  const expiryDate = new Date();
  if (type === 'setup') {
    // Keep it active for the initial 7 days
    expiryDate.setDate(expiryDate.getDate() + 7);
  } else {
    // weekly extension
    expiryDate.setDate(expiryDate.getDate() + 7);
  }

  const userKey = sessionId.replace(/[^a-z0-9_]/g, '');

  console.log(`[Subscription] Activating ${type} subscription for bot [${sessionId}], expiry: ${expiryDate.toLocaleString()}`);

  if (getIsFirestoreUsable() && premiumDb) {
    try {
      await premiumDb.doc(userKey).set({
        sessionId,
        type,
        expiry: admin.firestore.Timestamp.fromDate(expiryDate),
        updatedAt: admin.firestore.Timestamp.now()
      }, { merge: true });
    } catch (err: any) {
      console.warn(`[Subscription] Syncing subscription to Firestore for ${userKey} failed:`, err.message);
      handleFirestoreError(err);
    }
  }

  // Keep in-memory config for high availability!
  const premiumCache = global as any;
  if (!premiumCache.danscomPremium) {
    premiumCache.danscomPremium = new Map<string, any>();
  }
  premiumCache.danscomPremium.set(userKey, {
    sessionId,
    expiry: expiryDate,
    type
  });
};

/**
 * Checks if a bot session or sender JID has paid active subscription.
 */
export const isUserPaid = async (identifier: string): Promise<boolean> => {
  if (!identifier) {
    return false;
  }
  // Always true for owner to avoid locking admin sessions
  if (identifier === 'default_bot' || identifier.includes('owner')) {
    return true;
  }

  const key = identifier.split(':')[0].split('@')[0].replace(/[^a-z0-9_]/g, '');

  // Check memory cache first
  const premiumCache = global as any;
  if (premiumCache.danscomPremium?.has(key)) {
    const data = premiumCache.danscomPremium.get(key);
    if (data.expiry > new Date()) return true;
  }

  if (getIsFirestoreUsable() && premiumDb) {
    try {
      const doc = await premiumDb.doc(key).get();
      if (doc.exists) {
        const data = doc.data();
        const expiry = data?.expiry?.toDate() || new Date(0);
        
        // Sync cache
        if (!premiumCache.danscomPremium) {
          premiumCache.danscomPremium = new Map();
        }
        premiumCache.danscomPremium.set(key, {
          sessionId: data?.sessionId || key,
          expiry,
          type: data?.type || 'weekly'
        });

        if (expiry > new Date()) return true;
      }
    } catch (err: any) {
      console.warn(`[Subscription Check] Firestore read for ${key} failed, falling back to permissive mode:`, err.message);
      handleFirestoreError(err);
      return true; // fail-open defensively on DB failure so users aren't locked out!
    }
  }

  return false;
};

/**
 * Find the terminal associated with a particular WhatsApp bot session ID.
 */
export const getTerminalForSession = async (sessionId: string): Promise<Terminal | null> => {
  const terminals = await getAllTerminals();
  const found = terminals.find(t => t.sessionIds && t.sessionIds.includes(sessionId));
  return found || null;
};

/**
 * Retrieve all payment transactions.
 */
export const getAllPayments = async (): Promise<PaymentTransaction[]> => {
  const now = Date.now();
  if (now - lastPaymentsFetch < CACHE_TTL_MS && inMemoryPayments.size > 0) {
    return Array.from(inMemoryPayments.values());
  }

  if (getIsFirestoreUsable() && paymentsDb) {
    try {
      const snapshot = await paymentsDb.get();
      const list: PaymentTransaction[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() } as PaymentTransaction);
      });
      // Synchronize in-memory cache
      list.forEach(tx => inMemoryPayments.set(tx.id, tx));
      lastPaymentsFetch = now;
      return list;
    } catch (err: any) {
      console.warn('[TerminalService] Firestore getAllPayments failed, using in-memory fallbacks:', err.message);
      handleFirestoreError(err);
    }
  }
  return Array.from(inMemoryPayments.values());
};

export interface SessionMetadata {
  clientName: string;
  clientPhone: string;
}

const inMemoryMetadata = new Map<string, SessionMetadata>();

export const saveSessionMetadata = async (sessionId: string, clientName: string, clientPhone: string): Promise<void> => {
  inMemoryMetadata.set(sessionId, { clientName, clientPhone });
  if (getIsFirestoreUsable() && settingsDb) {
    try {
      await settingsDb.doc(`metadata_${sessionId}`).set({ clientName, clientPhone });
    } catch (e: any) {
      console.warn(`[TerminalService] Failed to save session metadata for ${sessionId}:`, e.message);
    }
  }
};

export const getSessionMetadata = async (sessionId: string): Promise<SessionMetadata | null> => {
  if (inMemoryMetadata.has(sessionId)) {
    return inMemoryMetadata.get(sessionId) || null;
  }
  if (getIsFirestoreUsable() && settingsDb) {
    try {
      const doc = await settingsDb.doc(`metadata_${sessionId}`).get();
      if (doc.exists) {
        const data = doc.data() as SessionMetadata;
        inMemoryMetadata.set(sessionId, data);
        return data;
      }
    } catch (e: any) {
      console.warn(`[TerminalService] Failed to get session metadata for ${sessionId}:`, e.message);
    }
  }
  return null;
};


