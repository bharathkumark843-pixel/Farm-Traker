import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Product, UsageLog } from '../db/types';
import * as DB from '../db/database';

// Simple global store: loads products + logs from SQLite, refreshes screens.
interface AppState {
  products: Product[];
  logs: UsageLog[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppState>({ products: [], logs: [], loading: true, refresh: async () => {} });

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await DB.initDb();
      setProducts(await DB.getProducts());
      setLogs(await DB.getLogs());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ products, logs, loading, refresh }}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}
