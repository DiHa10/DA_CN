"use client";

import { api, json, type Review } from "@/lib/api";
import { formatDate } from "@/lib/labels";
import { useRef, useState } from "react";

// Trả lời một review: AI gợi ý nháp, chủ quán sửa rồi lưu; sao chép để dán lên Google Maps.
export function ReplyBox({ storeId, review, onSaved }: { storeId: number; review: Review; onSaved: (r: Review) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.reply_text ?? "");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const base = `/stores/${storeId}/reviews/${review.id}`;
  // đóng ô soạn thì trả focus về nút "Trả lời"/"Sửa", không để người dùng bàn phím bị rơi về đầu trang
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setEditing(false);
    setError("");
    requestAnimationFrame(() => toggleRef.current?.focus());
  };

  async function run(kind: "draft" | "save", fn: () => Promise<void>) {
    setBusy(kind);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  const suggest = () =>
    run("draft", async () => setText((await api<{ reply_text: string }>(`${base}/reply-draft`, { method: "POST" })).reply_text));

  const save = () =>
    run("save", async () => {
      onSaved(await api<Review>(`${base}/reply`, json("PUT", { reply_text: text })));
      close();
    });

  async function copy() {
    try {
      await navigator.clipboard.writeText(review.reply_text ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Trình duyệt không cho sao chép, hãy bôi đen và sao chép thủ công");
    }
  }

  if (!editing) {
    return review.reply_text ? (
      <div className="mt-2 rounded-md bg-raised px-3 py-2 text-sm">
        <p className="text-xs text-muted">Quán đã trả lời · {formatDate(review.replied_at!)}</p>
        <p className="mt-0.5 whitespace-pre-line">{review.reply_text}</p>
        <div className="mt-1.5 flex gap-6 text-xs font-medium">
          <button ref={toggleRef} className="tap cursor-pointer text-accent hover:underline" onClick={() => { setText(review.reply_text ?? ""); setEditing(true); }}>Sửa</button>
          <button className="tap cursor-pointer text-accent hover:underline" onClick={copy}>{copied ? "Đã sao chép" : "Sao chép"}</button>
        </div>
        {error && <p role="alert" className="mt-1 text-xs text-negative">{error}</p>}
      </div>
    ) : (
      <button ref={toggleRef} className="tap mt-1.5 cursor-pointer text-xs font-medium text-accent hover:underline" onClick={() => setEditing(true)}>
        Trả lời
      </button>
    );
  }

  const id = `reply-${review.id}`;
  return (
    <div className="mt-2">
      <label htmlFor={id} className="sr-only">Câu trả lời cho đánh giá</label>
      <textarea id={id} autoFocus rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Viết câu trả lời, hoặc bấm “Gợi ý bằng AI”" className="input h-auto py-2" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="btn" onClick={suggest} disabled={busy !== null}>{busy === "draft" ? "AI đang viết…" : "Gợi ý bằng AI"}</button>
        <button className="btn" onClick={save} disabled={busy !== null}>{busy === "save" ? "Đang lưu…" : "Lưu"}</button>
        <button className="tap cursor-pointer px-2 text-sm text-muted hover:text-ink" onClick={close}>Hủy</button>
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-negative">{error}</p>}
    </div>
  );
}
