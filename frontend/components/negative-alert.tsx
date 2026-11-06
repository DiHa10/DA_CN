"use client";

import { useStores } from "@/components/store-context";
import { api, type Review } from "@/lib/api";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Đếm review tiêu cực đến sau lần chủ quán xem danh sách tiêu cực gần nhất.
// shortcut: mốc "đã xem" lưu trong localStorage nên mỗi trình duyệt đếm riêng và chỉ thấy tối đa 50 cái mới;
// chuyển mốc này lên server (bảng theo user + store) khi nhiều người cùng quản lý một quán.
const POLL_MS = 60_000;
const key = (storeId: number) => `negSeen:${storeId}`;

type Ctx = { newIds: Set<number>; markSeen: () => void };
const AlertCtx = createContext<Ctx>({ newIds: new Set(), markSeen: () => {} });

function readSeen(storeId: number): number | null {
  try {
    const v = localStorage.getItem(key(storeId));
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function writeSeen(storeId: number, id: number) {
  try {
    localStorage.setItem(key(storeId), String(id));
  } catch {}
}

export function NegativeAlertProvider({ children }: { children: React.ReactNode }) {
  // bám theo id, không theo object: danh sách quán tải lại tạo object mới, làm vòng hỏi chạy lại ngay (từng thấy 8 request cùng lúc)
  const storeId = useStores().store?.id;
  const [latest, setLatest] = useState<Review[]>([]);
  const [seen, setSeen] = useState<number | null>(null);

  const poll = useCallback(async () => {
    if (!storeId) return;
    const rows = await api<Review[]>(`/stores/${storeId}/reviews?sentiment=negative&hidden=false&limit=50`).catch(() => null);
    if (!rows) return;
    let mark = readSeen(storeId);
    const top = Math.max(0, ...rows.map((r) => r.id));
    // lần đầu mở: không báo toàn bộ lịch sử là "mới";
    // mốc lớn hơn mọi id hiện có = database đã bị reset (id đánh lại từ 1), mốc cũ không còn ý nghĩa
    if (mark === null || top < mark) {
      mark = top;
      writeSeen(storeId, mark);
    }
    setSeen(mark);
    setLatest(rows);
  }, [storeId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const newIds = new Set(seen === null ? [] : latest.filter((r) => r.id > seen).map((r) => r.id));

  const markSeen = useCallback(() => {
    if (!storeId || !latest.length) return;
    const top = Math.max(...latest.map((r) => r.id));
    writeSeen(storeId, top);
    setSeen(top);
  }, [storeId, latest]);

  return <AlertCtx.Provider value={{ newIds, markSeen }}>{children}</AlertCtx.Provider>;
}

export const useNegativeAlert = () => useContext(AlertCtx);
