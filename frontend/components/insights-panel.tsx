"use client";

import { api, type Insight } from "@/lib/api";
import { ASPECT_LABEL } from "@/lib/labels";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const SHOWN = 3; // cột phải dashboard: 3 khía cạnh nhiều lượt chê nhất, phần còn lại mở khi cần

// ngày bắt đầu cửa sổ AI đọc, theo giờ VN (bộ lọc date_from tính theo ngày VN)
const since = (iso: string, days: number) =>
  new Date(new Date(iso).getTime() - days * 86400e3).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

// Tóm tắt AI: vấn đề chính và việc nên làm theo khía cạnh. Lưu ở backend nên mở trang không phải chạy AI lại.
export function InsightsPanel({ storeId, canRegenerate }: { storeId: number; canRegenerate: boolean }) {
  const [insight, setInsight] = useState<Insight | null | undefined>(undefined); // undefined = đang tải
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

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
    // nằm ở cột phải dashboard: tiêu đề ngoài khung như "Tiêu cực gần đây"
    <section aria-busy={busy}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="heading">Gợi ý cải thiện</h2>
        {canRegenerate && (
          <button className="tap cursor-pointer text-sm font-medium text-accent hover:underline disabled:cursor-wait disabled:text-muted disabled:no-underline"
            onClick={regenerate} disabled={busy}>
            {busy ? "AI đang đọc…" : insight ? "Cập nhật" : "Tạo gợi ý"}
          </button>
        )}
      </div>
      <div className="panel">
        <p className="border-b border-rule px-4 py-2.5 text-xs text-muted">
          {insight
            ? `AI đọc ${c!.negative_reviews} đánh giá tiêu cực ${c!.window_days} ngày qua · ${formatTime(insight.generated_at)}`
            : `AI đọc đánh giá tiêu cực 30 ngày qua và đề xuất việc nên làm, mất khoảng nửa phút`}
        </p>
        {error && <p role="alert" className="px-4 pt-3 text-sm text-negative">{error}</p>}
        {insight === undefined && !error && <p className="px-4 py-3 text-sm text-muted">Đang tải…</p>}
        {insight === null && !error && <p className="px-4 py-3 text-sm text-muted">{canRegenerate ? "Chưa có gợi ý. Bấm “Tạo gợi ý”." : "Chưa có gợi ý. Quản lý hoặc chủ quán tạo gợi ý."}</p>}

        {c && (
          <ul>
            {(showAll ? c.aspects : c.aspects.slice(0, SHOWN)).map((a, i) => (
              <li key={a.aspect} className="border-t border-rule px-4 py-3 first:border-t-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{ASPECT_LABEL[a.aspect] ?? a.aspect}</span>
                  {/* cùng cửa sổ ngày và bỏ review đã ẩn như lúc AI đọc, để số review mở ra khớp số lượt chê */}
                  <Link href={`/reviews?aspect=${a.aspect}&sentiment=negative&hidden=false&date_from=${since(insight!.generated_at, c.window_days)}`}
                    className="tap num text-xs whitespace-nowrap text-accent hover:underline">
                    {a.mentions} lượt chê
                  </Link>
                  {i === 0 && (
                    <span className="sign ml-auto flex-none whitespace-nowrap">
                      Ưu tiên
                    </span>
                  )}
                </p>
                <p className="mt-1">{a.problem}</p>
                {a.actions.length > 0 && (
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
                    {a.actions.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {c && c.aspects.length > SHOWN && (
          <div className="border-t border-rule p-3">
            <button className="btn w-full" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
              {showAll ? "Thu gọn" : `Xem thêm ${c.aspects.length - SHOWN} khía cạnh`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
