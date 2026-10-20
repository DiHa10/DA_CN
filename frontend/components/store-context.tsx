"use client";

import { api, type Store } from "@/lib/api";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Ctx = {
  stores: Store[] | null; // null = đang tải
  store: Store | null;
  select: (id: number) => void;
  reload: () => Promise<void>;
};

const StoreCtx = createContext<Ctx | null>(null);
const KEY = "selectedStore";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setStores(await api<Store[]>("/stores"));
  }, []);

  useEffect(() => {
    try {
      setSelectedId(Number(localStorage.getItem(KEY)) || null);
    } catch {}
    reload();
  }, [reload]);

  const select = (id: number) => {
    setSelectedId(id);
    try {
      localStorage.setItem(KEY, String(id));
    } catch {}
  };

  const store = stores?.find((s) => s.id === selectedId) ?? stores?.[0] ?? null;
  return <StoreCtx.Provider value={{ stores, store, select, reload }}>{children}</StoreCtx.Provider>;
}

export function useStores() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStores phải nằm trong StoreProvider");
  return ctx;
}
