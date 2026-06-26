import { settingsDb, getIsFirestoreUsable, handleFirestoreError } from '../database/firebase.js';

const DEFAULTS: { [key: string]: boolean } = {
  auto_read: false,
  auto_status_view: true,
  auto_status_like: false,
  ai_smart_reply: false,
  anticall: false,
  auto_bio: false,
  fake_typing: false,
  fake_recording: false,
  see_deleted_messages: true,
  save_view_once: true,
  antilink: false,
};

const cache: { [key: string]: boolean } = {};

export const isEnabled = async (feature: string, sessionId: string = 'default_bot'): Promise<boolean> => {
  const cacheKey = `${sessionId}_${feature}`;
  if (cache[cacheKey] !== undefined) return cache[cacheKey];
  
  if (!getIsFirestoreUsable() || !settingsDb) {
    return DEFAULTS[feature] ?? false;
  }

  try {
    const doc = await settingsDb.doc(cacheKey).get();
    if (doc.exists) {
      cache[cacheKey] = doc.data()?.value ?? (DEFAULTS[feature] ?? false);
      return cache[cacheKey];
    }
  } catch (err: any) {
    console.warn(`[Settings] Failed to fetch feature ${feature} for session ${sessionId} from Firestore:`, err.message);
    handleFirestoreError(err);
  }
  
  cache[cacheKey] = DEFAULTS[feature] ?? false;
  return cache[cacheKey];
};

export const setFeature = async (feature: string, value: boolean, sessionId: string = 'default_bot') => {
  const cacheKey = `${sessionId}_${feature}`;
  cache[cacheKey] = value;
  if (getIsFirestoreUsable() && settingsDb) {
    try {
      await settingsDb.doc(cacheKey).set({ value });
    } catch (err: any) {
      console.warn(`[Settings] Failed to update feature ${feature} for session ${sessionId} in Firestore:`, err.message);
      handleFirestoreError(err);
    }
  }
};
