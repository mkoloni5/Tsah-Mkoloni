import { 
  AuthenticationCreds, 
  AuthenticationState, 
  SignalDataTypeMap, 
  initAuthCreds, 
  BufferJSON, 
  proto 
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { sessionsDb, getIsFirestoreUsable, handleFirestoreError } from './firebase.js';

const LOCAL_FALLBACK_DIR = path.join(process.cwd(), 'local_auth_fallback');

export const useFirestoreAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
  const sessionFallbackDir = path.join(LOCAL_FALLBACK_DIR, sessionId);
  
  try {
    if (!fs.existsSync(LOCAL_FALLBACK_DIR)) {
      fs.mkdirSync(LOCAL_FALLBACK_DIR, { recursive: true });
    }
    if (!fs.existsSync(sessionFallbackDir)) {
      fs.mkdirSync(sessionFallbackDir, { recursive: true });
    }
  } catch (e) {}

  const writeData = async (data: any, id: string) => {
    // 1. Dual write to file system fallback (always safe)
    const filepath = path.join(sessionFallbackDir, `${id}.json`);
    try {
      const payload = JSON.stringify(data, BufferJSON.replacer);
      fs.writeFileSync(filepath, payload, 'utf8');
    } catch (fsErr: any) {
      console.warn(`[FirestoreStore] Failed to write local fallback for ${id}:`, fsErr.message);
    }

    // 2. Write to Firestore if usable
    if (getIsFirestoreUsable() && sessionsDb) {
      try {
        await sessionsDb.doc(`${sessionId}_${id}`).set({
          data: JSON.stringify(data, BufferJSON.replacer)
        });
      } catch (err: any) {
        console.error('[FirestoreStore] writeData Firestore call failed, using local fallback:', err.message);
        handleFirestoreError(err);
      }
    }
  };

  const readData = async (id: string) => {
    // 1. Try reading from Firestore first if usable
    if (getIsFirestoreUsable() && sessionsDb) {
      try {
        const doc = await sessionsDb.doc(`${sessionId}_${id}`).get();
        if (doc.exists) {
          const raw = doc.data()?.data;
          if (raw) {
            return JSON.parse(raw, BufferJSON.reviver);
          }
        }
      } catch (err: any) {
        console.error('[FirestoreStore] readData Firestore call failed, falling back to local files:', err.message);
        handleFirestoreError(err);
      }
    }

    // 2. Fall back to local file system
    const filepath = path.join(sessionFallbackDir, `${id}.json`);
    try {
      if (fs.existsSync(filepath)) {
        const raw = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(raw, BufferJSON.reviver);
      }
    } catch (fsErr: any) {
      console.warn(`[FirestoreStore] Failed to read local fallback for ${id}:`, fsErr.message);
    }
    return null;
  };

  const removeData = async (id: string) => {
    // 1. Delete local fallback file
    const filepath = path.join(sessionFallbackDir, `${id}.json`);
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    } catch (fsErr: any) {}

    // 2. Delete from Firestore if usable
    if (getIsFirestoreUsable() && sessionsDb) {
      try {
        await sessionsDb.doc(`${sessionId}_${id}`).delete();
      } catch (err: any) {
        console.error('[FirestoreStore] removeData Firestore call failed:', err.message);
        handleFirestoreError(err);
      }
    }
  };

  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        await Promise.all(
          ids.map(async (id) => {
            let value = await readData(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          })
        );
        return data;
      },
      set: async (data) => {
        const tasks: Promise<void>[] = [];
        for (const category in data) {
          for (const id in data[category as keyof SignalDataTypeMap]) {
            const value = data[category as keyof SignalDataTypeMap]![id];
            const key = `${category}-${id}`;
            if (value) {
              tasks.push(writeData(value, key));
            } else {
              tasks.push(removeData(key));
            }
          }
        }
        await Promise.all(tasks);
      }
    }
  };

  return {
    state,
    saveCreds: async () => {
      try {
        await writeData(state.creds, 'creds');
      } catch (err: any) {
        console.error('[FirestoreStore] saveCreds failed:', err.message);
      }
    }
  };
};
