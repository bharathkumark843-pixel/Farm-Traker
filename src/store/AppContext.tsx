import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Product, UsageLog } from '../db/types';
import * as DB from '../db/database';
import { isCloudConfigured } from '../db/cloud';
import { syncNow as runCloudSync, lastSyncAt, type SyncResult } from '../db/sync';

// Simple global store: loads products + logs from SQLite, refreshes screens.
// Cloud backup (Supabase) runs in the background after local load — the UI never
// waits for network.
interface AppState {
  products: Product[];
  logs: UsageLog[];
  loading: boolean;
  refresh: () => Promise<void>;
  cloudOn: boolean;
  syncing: boolean;
  lastSync: string;
  syncNow: () => Promise<SyncResult>;
}

const Ctx = createContext<AppState>({
  products: [], logs: [], loading: true, refresh: async () => {},
  cloudOn: false, syncing: false, lastSync: '', syncNow: async () => ({ ok: false, reason: 'not-configured' }),
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloudOn] = useState(isCloudConfigured());
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('');

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    if (!isCloudConfigured()) return { ok: false, reason: 'not-configured' };
    setSyncing(true);
    try {
      const r = await runCloudSync();
      if (r.ok) {
        setLastSync(r.at);
        // Pull may have brought newer rows — reload the local view.
        setProducts(await DB.getProducts());
        setLogs(await DB.getLogs());
      }
      return r;
    } finally {
      setSyncing(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await DB.initDb();
      setProducts(await DB.getProducts());
      setLogs(await DB.getLogs());
      setLastSync(await lastSyncAt());
    } finally {
      setLoading(false);
    }
    // Background cloud backup: fire-and-forget, never blocks the UI.
    if (isCloudConfigured()) {
      runCloudSync().then(async (r) => {
        if (r.ok) {
          setLastSync(r.at);
          setProducts(await DB.getProducts());
          setLogs(await DB.getLogs());
        }
      }).catch(() => { /* offline or cloud error — local data unaffected */ });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ products, logs, loading, refresh, cloudOn, syncing, lastSync, syncNow }}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}
