"use client";

import { api, json, type Review } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/labels";
import { useState } from "react";
import { Busy } from "./dots";

// Theo dõi lời chê đã được xử lý chưa (gọi lại khách, đổi món...): đổi trạng thái là lưu ngay, ghi chú để biết đã làm gì.
export function HandlingBox({ storeId, review, onSaved }: { storeId: number; review: Review; onSaved: (r: Review) => void }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(review.status_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `status-${review.id}`;

  async function save(status: string | null, text: string) {
    setBusy(true);
    setError("");
    try {
      onSaved(await api<Review>(`/stores/${storeId}/reviews/${review.id}/status`, json("PUT", { status, note: text })));
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <label htmlFor={id} className="text-muted">Xử lý lời chê</label>
      <select id={id} className={`control h-11 text-xs md:h-7 ${review.status === "done" ? "border-positive text-positive" : ""}`}
        value={review.status ?? ""} disabled={busy} onChange={(e) => save(e.target.value || null, review.status_note ?? "")}>
        <option value="">Chưa xử lý</option>
        {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {!editing && review.status_note && <span className="text-sm text-ink">{review.status_note}</span>}
      {!editing && (
        <button type="button" className="tap cursor-pointer font-medium text-accent hover:underline"
          onClick={() => { setNote(review.status_note ?? ""); setEditing(true); }}>
          {review.status_note ? "Sửa ghi chú" : "Ghi chú đã làm gì"}
        </button>
      )}
      {editing && (
        <form className="anim-rise flex basis-full flex-wrap items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); save(review.status ?? "doing", note); }}>
          <label htmlFor={`${id}-note`} className="sr-only">Ghi chú xử lý</label>
          <input id={`${id}-note`} autoFocus maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: đã gọi xin lỗi, tặng phiếu giảm giá" className="control min-w-0 flex-1 text-sm" />
          <button className="btn" disabled={busy}>{busy ? <Busy text="Đang lưu" /> : "Lưu"}</button>
          <button type="button" className="tap cursor-pointer px-2 text-sm text-muted hover:text-ink" onClick={() => setEditing(false)}>Hủy</button>
        </form>
      )}
      {error && <p role="alert" className="basis-full text-negative">{error}</p>}
    </div>
  );
}
