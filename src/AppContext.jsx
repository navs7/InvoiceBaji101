import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { db } from './db/index.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Holds the signed-in user and the business settings that nearly every screen needs.
export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const [settings, setSettings] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [toast, setToast] = useState(null);

  const reload = useCallback(async () => {
    setSettings(await db.getSettings());
    setConfigured(await db.hasSettings());
  }, []);

  useEffect(() => db.auth.subscribe((u) => setUser(u || null)), []);
  useEffect(() => { if (user) reload(); else setSettings(null); }, [user, reload]);

  const notify = useCallback((message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), kind === 'error' ? 8000 : 3500);
  }, []);

  return (
    <Ctx.Provider value={{ user, settings, configured, reload, notify, toast, signOut: () => db.auth.signOut() }}>
      {children}
    </Ctx.Provider>
  );
}
