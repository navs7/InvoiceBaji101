import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, getDocs, getFirestore, runTransaction, setDoc, writeBatch,
} from 'firebase/firestore';
import { fyOfDate } from '../lib/dates.js';
import { counterKey } from '../lib/numbering.js';
import { DEFAULT_SETTINGS, clone, newId, prepareIssue } from './shared.js';

export const firebaseConfigured = !!import.meta.env.VITE_FIREBASE_API_KEY;

// Firestore layout (single user):
//   users/{uid}/meta/settings          business profile + preferences
//   users/{uid}/clients/{id}
//   users/{uid}/invoices/{id}
//   users/{uid}/counters/{template_FY}  last used sequence number
export function createFirebaseDb() {
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  const fs = getFirestore(app);
  const uid = () => {
    if (!auth.currentUser) throw new Error('You are signed out. Please sign in again.');
    return auth.currentUser.uid;
  };
  const col = (name) => collection(fs, 'users', uid(), name);
  const ref = (name, id) => doc(fs, 'users', uid(), name, id);
  const settingsRef = () => doc(fs, 'users', uid(), 'meta', 'settings');

  return {
    mode: 'firebase',
    auth: {
      subscribe: (cb) => onAuthStateChanged(auth, cb),
      signIn: (email, pw) => signInWithEmailAndPassword(auth, email, pw),
      signOut: () => signOut(auth),
    },
    async getSettings() {
      const s = await getDoc(settingsRef());
      return { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
    },
    async hasSettings() { return (await getDoc(settingsRef())).exists(); },
    async saveSettings(s) { await setDoc(settingsRef(), clone(s)); },
    async list(name) { return (await getDocs(col(name))).docs.map((d) => ({ ...d.data(), id: d.id })); },
    async get(name, id) {
      const s = await getDoc(ref(name, id));
      return s.exists() ? { ...s.data(), id } : null;
    },
    async put(name, obj) {
      const id = obj.id || newId();
      const o = clone({ ...obj, id });
      await setDoc(ref(name, id), o);
      return o;
    },
    async remove(name, id) { await deleteDoc(ref(name, id)); },
    async issueInvoice(id, supplier) {
      const invRef = ref('invoices', id);
      return runTransaction(fs, async (tx) => {
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error('Invoice not found.');
        const inv = { ...invSnap.data(), id };
        const cRef = ref('counters', counterKey(inv.template, fyOfDate(inv.date)));
        const cSnap = await tx.get(cRef);
        const { key, seq, invoice } = prepareIssue(inv, cSnap.exists() ? cSnap.data().last : 0, supplier);
        tx.set(ref('counters', key), { last: seq });
        tx.set(invRef, clone(invoice));
        return invoice;
      });
    },
    async exportAll() {
      const out = { settings: null, clients: {}, invoices: {}, counters: {} };
      const s = await getDoc(settingsRef());
      out.settings = s.exists() ? s.data() : null;
      for (const name of ['clients', 'invoices']) (await this.list(name)).forEach((o) => { out[name][o.id] = o; });
      (await getDocs(col('counters'))).docs.forEach((d) => { out.counters[d.id] = d.data().last; });
      return out;
    },
    async clearAll() {
      for (const name of ['clients', 'invoices', 'counters']) {
        const docs = (await getDocs(col(name))).docs;
        for (let i = 0; i < docs.length; i += 400) {
          const b = writeBatch(fs);
          docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
          await b.commit();
        }
      }
      await deleteDoc(settingsRef());
    },
    async importAll(data) {
      await this.clearAll();
      const writes = [];
      if (data.settings) writes.push([settingsRef(), data.settings]);
      for (const name of ['clients', 'invoices']) Object.values(data[name] || {}).forEach((o) => writes.push([ref(name, o.id), o]));
      Object.entries(data.counters || {}).forEach(([k, last]) => writes.push([ref('counters', k), { last }]));
      for (let i = 0; i < writes.length; i += 400) {
        const b = writeBatch(fs);
        writes.slice(i, i + 400).forEach(([r, v]) => b.set(r, clone(v)));
        await b.commit();
      }
    },
  };
}
