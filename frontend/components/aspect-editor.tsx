"use client";

import { api, json, type Review } from "@/lib/api";
import { ASPECT_LABEL } from "@/lib/labels";
import { useState } from "react";

const CHOICES = [["none", "Không nhắc"], ["positive", "Khen"], ["neutral", "Trung lập"], ["negative", "Chê"]] as const;

// Sửa nhãn model đoán sai (quản lý trở lên). Lưu ngay mỗi lần đổi; nhãn sửa được giữ khi phân tích lại
// và lưu riêng để đo lại hoặc huấn luyện thêm model.
export function AspectEditor({ storeId, review, onSaved }: { storeId: number; review: Review; onSaved: (r: Review) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const current = Object.fromEntries(review.aspects.map((a) => [a.aspect, a.sentiment]));

  async function change(aspect: string, sentiment: string) {
    setBusy(aspect);
    setError("");
    try {
      onSaved(await api<Review>(`/stores/${storeId}/reviews/${review.id}/aspects/${aspect}`, json("PUT", { sentiment })));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="tap cursor-pointer text-xs font-medium text-accent hover:underline">
        {open ? "Xong" : "Sửa nhãn"}
      </button>
      {open && (
        <div className="anim-rise basis-full rounded-md bg-raised p-3">
          <p className="mb-2 text-xs text-muted">Máy đoán sai thì chọn lại. Số liệu cập nhật ngay; nhãn bạn sửa được giữ khi phân tích lại.</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            {Object.entries(ASPECT_LABEL).map(([aspect, label]) => {
              const id = `fix-${review.id}-${aspect}`;
              return (
                <div key={aspect}>
                  <label htmlFor={id} className="mb-1 block text-xs font-medium">{label}</label>
                  <select id={id} className="control w-full" value={current[aspect] ?? "none"} disabled={busy !== null}
                    onChange={(e) => change(aspect, e.target.value)}>
                    {CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-negative">{error}</p>}
        </div>
      )}
    </>
  );
}
