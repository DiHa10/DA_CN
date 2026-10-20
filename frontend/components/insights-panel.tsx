"use client";

import { api, type Insight } from "@/lib/api";
import { ASPECT_LABEL } from "@/lib/labels";
import { useCallback, useEffect, useState } from "react";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

// Tóm tắt AI: vấn đề chính và việc nên làm theo khía cạnh. Lưu ở backend nên mở trang không tốn lượt gọi AI.
export function InsightsPanel({ storeId }: { storeId: number }) {
  const [insight, setInsight] = useState<Insight | null | undefined>(undefined); // undefined = đang tải
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setInsight(undefined);
    setError("");
    api<Insight | null>(`/stores/${storeId}/insights`).then(setInsight, (e) => setError(e.message));
  }, [storeId]);

  const regenerate = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setInsight(await api<Insight>(`/stores/${storeId}/insights`, { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }, [storeId]);

  const c = insight?.content;
  return (
    <section className="panel" aria-busy={busy}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-base font-semibold">Gợi ý cải thiện</h2>
          <p className="text-xs text-muted">
            {insight
              ? `AI đọc ${c!.negative_reviews} đánh giá tiêu cực trong ${c!.window_days} ngày · cập nhật ${formatTime(insight.generated_at)}`
              : "AI đọc các đánh giá tiêu cực 30 ngày qua và đề xuất việc nên làm"}
          </p>
        </div>
        <button className="btn" onClick={regenerate} disabled={busy}>
          {busy ? "AI đang đọc đánh giá…" : insight ? "Cập nhật" : "Tạo gợi ý"}
        </button>
      </div>

      {error && <p role="alert" className="px-5 pt-3 text-sm text-negative">{error}</p>}
      {insight === undefined && !error && <p className="px-5 py-4 text-sm text-muted">Đang tải…</p>}
      {insight === null && !error && (
        <p className="px-5 py-4 text-sm text-muted">Chưa có gợi ý. Bấm “Tạo gợi ý” (mỗi lần tạo là một lượt gọi AI có tính phí).</p>
      )}

      {c && (
        <div className="px-5 pt-3 pb-4">
          <p className="font-medium">{c.headline}</p>
          <ul className="mt-3">
            {c.aspects.map((a) => (
              <li key={a.aspect} className="border-t border-rule py-3 first:border-t-0 sm:grid sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-4">
                <p className="font-medium">
                  {ASPECT_LABEL[a.aspect] ?? a.aspect} <span className="num font-normal text-muted">{a.mentions} lượt chê</span>
                </p>
                <div>
                  <p className="text-muted">{a.problem}</p>
                  {a.actions.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                      {a.actions.map((x) => <li key={x}>{x}</li>)}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
