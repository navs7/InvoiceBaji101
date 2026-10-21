import { createFirebaseDb, firebaseConfigured } from './firebase.js';
import { createLocalDb } from './local.js';

// Firebase when .env is filled in, otherwise a localStorage demo mode.
export const db = firebaseConfigured ? createFirebaseDb() : createLocalDb();
