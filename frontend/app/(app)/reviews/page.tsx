"use client";

import { useNegativeAlert } from "@/components/negative-alert";
import { ReplyBox } from "@/components/reply-box";
import { AspectChip, SentimentBadge } from "@/components/sentiment-badge";
import { useStores } from "@/components/store-context";
import { api, can, json, type Review } from "@/lib/api";
import { ASPECT_LABEL, formatDate, SENTIMENT_LABEL, SOURCE_LABEL, SPAM_LABEL } from "@/lib/labels";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const PAGE = 50;
const TABS = [["", "Tất cả"], ["negative", SENTIMENT_LABEL.negative], ["neutral", SENTIMENT_LABEL.neutral], ["positive", SENTIMENT_LABEL.positive]];
const FILTERS = ["aspect", "source", "replied", "spam", "hidden", "date_from", "date_to"] as const;

export default function ReviewsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Đang tải…</p>}>
      <Reviews />
    </Suspense>
  );
}

function Reviews() {
  const { store } = useStores();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const { newIds, markSeen } = useNegativeAlert();
  const [shownNew, setShownNew] = useState<Set<number>>(new Set());
  const query = params.toString();
  const sentiment = params.get("sentiment") ?? "";

  async function fetchPage(offset: number) {
    const q = new URLSearchParams(query);
    q.set("limit", String(PAGE));
    q.set("offset", String(offset));
    const page = await api<Review[]>(`/stores/${store!.id}/reviews?${q}`);
    setHasMore(page.length === PAGE);
    return page;
  }

  useEffect(() => {
    if (!store) return;
    setReviews(null);
    setError("");
    fetchPage(0).then(setReviews, (e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, query]);

  function setFilter(key: string, value: string) {
    const q = new URLSearchParams(query);
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(`${pathname}?${q}`);
  }

  // mở danh sách tiêu cực = đã xem; giữ nhãn "Mới" trên các dòng vừa xem cho tới khi rời trang
  useEffect(() => {
    if (sentiment !== "negative" || !reviews || newIds.size === 0) return;
    setShownNew(new Set(newIds));
    markSeen();
  }, [sentiment, reviews, newIds, markSeen]);

  const replace = (saved: Review) => setReviews((list) => list && list.map((x) => (x.id === saved.id ? saved : x)));

  async function toggleHidden(r: Review) {
    try {
      replace(await api<Review>(`/stores/${store!.id}/reviews/${r.id}/hidden`, json("PUT", { hidden: !r.hidden })));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const select = (key: string, label: string, options: Record<string, string>) => (
    <>
      <label htmlFor={key} className="sr-only">{label}</label>
      <select id={key} className="control" value={params.get(key) ?? ""} onChange={(e) => setFilter(key, e.target.value)}>
        <option value="">{label}: tất cả</option>
        {Object.entries(options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </>
  );

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="title">Đánh giá</h1>
          <p className="mt-1 text-[15px] text-muted">Mọi đánh giá của {store?.name}, mới nhất trước.</p>
        </div>
        <div className="flex gap-2">
          {store && can(store, "manager") && (
            <a className="btn" href={`/api/backend/stores/${store.id}/reviews/export.xlsx${query ? `?${query}` : ""}`}>
              Xuất Excel
            </a>
          )}
          {can(store, "manager") && <Link href="/import" className="btn btn-primary btn-go">Nhập đánh giá</Link>}
        </div>
      </header>

      <nav aria-label="Lọc theo cảm xúc" className="mt-5 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-border">
        {TABS.map(([value, label]) => {
          const active = sentiment === value;
          return (
            <button key={value} onClick={() => setFilter("sentiment", value)} aria-pressed={active}
              className={`-mb-px cursor-pointer border-b-2 pt-3 pb-2.5 text-sm md:pt-0 whitespace-nowrap transition-colors duration-150 ${
                active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}>
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {select("aspect", "Khía cạnh", ASPECT_LABEL)}
        {select("source", "Nguồn", SOURCE_LABEL)}
        {select("replied", "Phản hồi", { false: "Chưa trả lời", true: "Đã trả lời" })}
        {select("spam", "Spam", { true: "Nghi spam", false: "Không nghi spam" })}
        {select("hidden", "Thống kê", { false: "Đang tính", true: "Đã ẩn" })}
        <label htmlFor="date_from" className="text-sm text-muted">Từ</label>
        <input id="date_from" type="date" className="control" value={params.get("date_from") ?? ""} onChange={(e) => setFilter("date_from", e.target.value)} />
        <label htmlFor="date_to" className="text-sm text-muted">đến</label>
        <input id="date_to" type="date" className="control" value={params.get("date_to") ?? ""} onChange={(e) => setFilter("date_to", e.target.value)} />
        {FILTERS.some((f) => params.get(f)) && (
          <button className="cursor-pointer px-2 text-sm font-medium text-accent hover:underline"
            onClick={() => router.replace(sentiment ? `${pathname}?sentiment=${sentiment}` : pathname)}>
            Xóa bộ lọc
          </button>
        )}
        {reviews && (
          <p className="num ml-auto text-sm text-muted">{reviews.length}{hasMore && "+"} đánh giá</p>
        )}
      </div>

      {error && <p role="alert" className="mt-4 text-sm">Không tải được đánh giá: {error}</p>}
      {!reviews && !error && <p className="mt-4 text-muted">Đang tải…</p>}
      {reviews?.length === 0 && (
        <p className="mt-4 rounded-lg border border-dashed border-control px-4 py-3 text-sm text-muted">Không có đánh giá nào khớp bộ lọc.</p>
      )}

      {reviews && reviews.length > 0 && (
        <table className="mt-4 w-full text-left">
          <thead className="hidden text-xs text-muted md:table-header-group">
            <tr>
              <th className="py-2 pr-4 font-normal">Nội dung</th>
              <th className="w-32 py-2 pr-4 font-normal">Nguồn</th>
              <th className="w-16 py-2 pr-4 text-right font-normal">Sao</th>
              <th className="w-28 py-2 pr-4 text-right font-normal">Ngày</th>
              {!sentiment && <th className="w-24 py-2 font-normal">Cảm xúc</th>}
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id} className="flex flex-wrap items-center gap-x-3 border-t border-rule py-3 md:table-row md:[&>td]:align-top">
                <td className="w-full md:w-auto md:py-3 md:pr-4">
                  <p>
                    {shownNew.has(r.id) && <span className="sign mr-2">Mới</span>}
                    <span className={`hand strike ${r.hidden ? "on text-muted" : ""}`}>{r.content}</span>
                  </p>
                  {(r.spam_reasons || r.hidden) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      {r.spam_reasons && (
                        <span className="rounded border border-control px-1.5 py-0.5 text-ink">
                          Nghi spam: {r.spam_reasons.map((x) => SPAM_LABEL[x] ?? x).join(", ")}
                        </span>
                      )}
                      {r.hidden && <span className="text-muted">Đã ẩn khỏi thống kê</span>}
                      {can(store, "manager") && (
                        <button className="tap cursor-pointer font-medium text-accent hover:underline" onClick={() => toggleHidden(r)}>
                          {r.hidden ? "Tính lại vào thống kê" : "Ẩn khỏi thống kê"}
                        </button>
                      )}
                    </div>
                  )}
                  {r.aspects.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {r.aspects.map((a) => <AspectChip key={a.aspect} label={ASPECT_LABEL[a.aspect] ?? a.aspect} sentiment={a.sentiment} />)}
                    </div>
                  )}
                  <ReplyBox storeId={store!.id} review={r} onSaved={replace} />
                </td>
                <td className="text-xs text-muted md:py-3 md:pr-4 md:text-sm">{SOURCE_LABEL[r.source] ?? r.source}</td>
                <td className="num text-xs text-muted md:py-3 md:pr-4 md:text-right md:text-sm md:text-ink">
                  {r.rating ? <>{r.rating}<span className="text-muted">/5</span></> : <span className="text-muted">—</span>}
                </td>
                <td className="num text-xs text-muted md:py-3 md:pr-4 md:text-right md:text-sm">{formatDate(r.created_at)}</td>
                {/* đang lọc theo cảm xúc thì mọi dòng giống nhau, bỏ cột để không thành một dải pill đỏ */}
                {!sentiment && (
                  <td className="ml-auto md:ml-0 md:py-3">
                    {r.analysis ? <SentimentBadge sentiment={r.analysis.sentiment} /> : <span className="text-xs text-muted">Đang phân tích…</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasMore && reviews && (
        <div className="mt-4 border-t border-rule pt-4 text-center">
          <button className="btn" onClick={() => fetchPage(reviews.length).then((p) => setReviews([...reviews, ...p]), (e) => setError(e.message))}>
            Tải thêm 50 đánh giá
          </button>
        </div>
      )}
    </div>
  );
}
