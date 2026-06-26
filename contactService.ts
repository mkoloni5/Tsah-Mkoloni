import { contactsDb, getIsFirestoreUsable } from '../database/firebase.js';
import admin from 'firebase-admin';

export const saveContact = async (jid: string, name?: string) => {
    if (!getIsFirestoreUsable() || !contactsDb) return;
    try {
        await contactsDb.doc(jid).set({
            jid,
            name: name || 'Unknown',
            savedAt: admin.firestore.Timestamp.now()
        }, { merge: true });
    } catch (error) {
        console.error('Save Contact Error:', error);
    }
};
