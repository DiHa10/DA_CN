"use client";

import { InsightsPanel } from "@/components/insights-panel";
import { Skeleton } from "@/components/skeleton";
import { useNegativeAlert } from "@/components/negative-alert";
import { useStores } from "@/components/store-context";
import { api, can, type Action, type Anomalies, type AspectRow, type Review, type Summary } from "@/lib/api";
import { ActionsPanel, TimeHeatmap } from "./followup";
import { AspectChart, Kpis, MoodCard, TrendChart } from "./charts";
import { ASPECT_LABEL, formatDate, SOURCE_LABEL } from "@/lib/labels";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// Câu hỏi của màn hình: "Khách đang chê điều gì nhiều nhất?" — bảng khía cạnh là khối lớn nhất.
const MIN_MENTIONS = 3; // khía cạnh ít lượt nhắc quá thì tỉ lệ không đáng tin
const negRate = (a: AspectRow) => (a.total ? a.negative / a.total : 0);
const pct0 = (r: number) => `${Math.round(r * 100)}%`;

// khoảng thời gian tính số liệu; chủ quán thường cần "tháng này" hơn là cả lịch sử
const RANGES = [["7", "7 ngày"], ["30", "30 ngày"], ["90", "3 tháng"], ["all", "Tất cả"]] as const;
type Range = (typeof RANGES)[number][0];
const RANGE_KEY = "dashRange";

export default function DashboardPage() {
  const { store } = useStores();
  const [data, setData] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Review[] | null>(null);
  const [anomalies, setAnomalies] = useState<Anomalies | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState("");
  const [range, setRange] = useState<Range>("30");

  // nhớ khoảng đã chọn trên máy này (chỉ là tiện ích hiển thị, mất cũng không sao)
  useEffect(() => {
    try {
      const v = localStorage.getItem(RANGE_KEY);
      if (RANGES.some(([k]) => k === v)) setRange(v as Range);
    } catch {}
  }, []);
  const pick = (r: Range) => {
    setRange(r);
    try { localStorage.setItem(RANGE_KEY, r); } catch {}
  };

  // theo id: danh sách quán tải lại tạo object mới, không được tải lại cả trang Tổng quan
  const storeId = store?.id;
  const latest = useRef(0); // đổi khoảng nhanh: bỏ kết quả của lần tải cũ về muộn, kẻo số 30 ngày đè lên "3 tháng"
  const load = useCallback(() => {
    if (!storeId) return;
    const req = ++latest.current;
    setError("");
    // cùng mốc "từ ngày" với backend (ngày VN, tính cả hôm nay) để 3 lời chê khớp con số đếm
    const from = range === "all" ? "" : `&date_from=${new Date(Date.now() + 7 * 3600e3 - (Number(range) - 1) * 86400e3).toISOString().slice(0, 10)}`;
    Promise.all([
      api<Summary>(`/stores/${storeId}/dashboard${range === "all" ? "" : `?days=${range}`}`),
      api<Review[]>(`/stores/${storeId}/reviews?complaint=true&status=open&hidden=false&limit=3${from}`),
      api<Anomalies>(`/stores/${storeId}/dashboard/anomalies`),
      api<Action[]>(`/stores/${storeId}/actions`),
    ]).then(([s, r, a, act]) => {
      if (req !== latest.current) return;
      setData(s); setRecent(r); setAnomalies(a); setActions(act);
    }, (e) => req === latest.current && setError(e.message));
  }, [storeId, range]);
  useEffect(load, [load]);
  const rangeLabel = RANGES.find(([k]) => k === range)![1];

  const aspects = [...(data?.aspects ?? [])]
    .filter((a) => a.total >= MIN_MENTIONS)
    .sort((a, b) => negRate(b) - negRate(a));
  const worst = aspects.find((a) => a.negative > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="title">Tổng quan</h1>
          <p className="mt-1 text-[15px] text-muted">
            {!data ? "Đang tải dữ liệu…"
              : worst ? <>Khách chê <b className="font-medium text-ink">{ASPECT_LABEL[worst.aspect] ?? worst.aspect}</b> nhiều nhất: {pct0(negRate(worst))} lượt nhắc là tiêu cực.</>
              : "Chưa có khía cạnh nào bị chê."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Khoảng thời gian" className="flex rounded-md bg-raised p-0.5 ring-1 ring-border">
            {RANGES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={range === k} onClick={() => pick(k)}
                className={`h-10 cursor-pointer rounded-sm px-3 text-[13px] transition-colors duration-150 md:h-8 ${
                  range === k ? "bg-surface font-medium text-ink ring-1 ring-border" : "text-muted hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
          {can(store, "manager") && <Link href="/import" className="btn btn-primary btn-go">Nhập đánh giá</Link>}
        </div>
      </header>

      {error && (
        <p role="alert" className="text-sm">
          Không tải được dữ liệu: {error}.{" "}
          <button onClick={load} className="cursor-pointer font-medium text-accent hover:underline">Thử lại</button>
        </p>
      )}

      {data && anomalies && <TodoCard anomalies={anomalies} data={data} />}

      {!data && !error && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="panel p-5"><Skeleton lines={8} /></div>
          <div className="panel p-5"><Skeleton lines={5} /></div>
        </div>
      )}

      {data && data.analyzed === 0 && (
        <div className="rounded-lg border border-dashed border-control px-4 py-3 text-sm text-muted">
          {data.since
            ? `Không có đánh giá nào trong ${rangeLabel.toLowerCase()} qua. Chọn khoảng dài hơn ở trên.`
            : "Chưa có đánh giá nào. Import file từ Google Maps hoặc in mã QR ở trang Cửa hàng để khách gửi góp ý."}
        </div>
      )}

      {data && data.analyzed > 0 && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <Kpis data={data} rangeLabel={rangeLabel} />
            <AspectChart aspects={aspects} since={data.since} />
            <MoodCard data={data} />
            <TrendChart data={data} actions={actions} />
            {store && <ActionsPanel storeId={store.id} actions={actions} canEdit={can(store, "manager")} onChange={setActions} />}
            <TimeHeatmap data={data.by_time} />
          </div>
          <div className="space-y-6">
            {store && <InsightsPanel storeId={store.id} canRegenerate={can(store, "manager")} days={range === "all" ? null : Number(range)} />}
            <Complaints items={data.complaints} since={data.since} />
            <OpenComplaints reviews={recent} count={data.open_complaints} since={data.since} />
          </div>
        </div>
      )}
    </div>
  );
}

// Cần làm: đặt trên cùng để chủ quán mở ra là biết nên làm gì trước, rồi mới tới số liệu.
// Mỗi dòng: loại việc (nhãn chữ), một câu có số và mốc so sánh, một nút làm ngay.
function TodoCard({ anomalies, data }: { anomalies: Anomalies; data: Summary }) {
  const items: { key: string; kind: string; pill: string; text: React.ReactNode; href: string; action: string }[] = [];
  for (const a of anomalies.alerts) {
    items.push({
      key: `anomaly-${a.aspect ?? "all"}`,
      kind: "Bất thường",
      pill: "bg-warn-soft text-warn",
      text: <>
        {a.aspect ? <><b className="font-medium">{ASPECT_LABEL[a.aspect] ?? a.aspect}</b> bị chê</> : <b className="font-medium">Tỉ lệ tiêu cực</b>}
        {" "}{pct0(a.rate)} trong 7 ngày qua ({a.negative}/{a.mentions}), 8 tuần trước chỉ {pct0(a.baseline_rate)}
      </>,
      href: `/reviews?sentiment=negative&date_from=${anomalies.since}${a.aspect ? `&aspect=${a.aspect}` : ""}`,
      action: "Xem đánh giá",
    });
  }
  if (data.open_complaints > 0)
    items.push({
      key: "open",
      kind: "Lời chê",
      pill: "bg-negative-soft text-[#831c1e]",
      text: <><b className="font-medium">{data.open_complaints} lời chê chưa xử lý</b> trong khoảng đang xem</>,
      href: `/reviews?complaint=true&status=open&hidden=false${data.since ? `&date_from=${data.since}` : ""}`,
      action: "Xử lý",
    });
  if (data.by_time.total === 0)
    items.push({
      key: "qr",
      kind: "Gợi ý",
      pill: "bg-active text-ink",
      text: <>Chưa có góp ý qua mã QR: in mã đặt ở bàn để khách góp ý ngay tại quán</>,
      href: "/stores",
      action: "Lấy mã QR",
    });

  return (
    <section aria-label="Cần làm" className="panel">
      <h2 className="heading px-4 pt-3 pb-1">Cần làm</h2>
      {items.length === 0 ? (
        <p className="px-4 pb-3 text-muted">Không có việc gấp: không có bất thường và mọi lời chê đã được xử lý.</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-rule px-4 py-2.5 first:border-t-0 sm:flex-nowrap">
              <span className={`w-[84px] shrink-0 rounded-full px-2 py-px text-center text-xs font-medium ${it.pill}`}>{it.kind}</span>
              <p className="min-w-0 flex-1">{it.text}</p>
              <Link href={it.href} className="btn ml-auto shrink-0">{it.action}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Cụm từ khách hay nhắc trong lời chê: cụ thể hơn tên khía cạnh ("mùi thuốc lá" thay vì "Không gian")
function Complaints({ items, since }: { items: Summary["complaints"]; since: string | null }) {
  if (!items.length) return null;
  const max = items[0].count;
  return (
    <section>
      <h2 className="heading mb-2">Khách hay nhắc khi chê</h2>
      <ul className="panel space-y-2 px-4 py-3">
        {items.map((c) => (
          <li key={c.phrase} className="grid grid-cols-[minmax(0,1fr)_72px_24px] items-center gap-3 text-sm">
            <Link href={`/reviews?q=${encodeURIComponent(c.phrase)}&complaint=true&hidden=false${since ? `&date_from=${since}` : ""}`}
              className="tap truncate font-medium hover:underline">
              {c.phrase}
            </Link>
            <span aria-hidden className="h-1.5 rounded-sm bg-negative/70" style={{ width: `${(c.count / max) * 100}%` }} />
            <span className="num text-right text-muted">{c.count}<span className="sr-only"> đánh giá</span></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// lời chê chưa xử lý xong (mới nhất trước): việc cần làm, không chỉ để đọc
function OpenComplaints({ reviews, count, since }: { reviews: Review[] | null; count: number; since: string | null }) {
  const { newIds } = useNegativeAlert();
  const href = `/reviews?complaint=true&status=${count ? "open" : "done"}&hidden=false${since ? `&date_from=${since}` : ""}`;
  return (
    <section>
      <h2 className="heading mb-2">Lời chê chưa xử lý <span className="num ml-1 text-ink">{count}</span></h2>
      <div className="panel">
        {!reviews ? (
          <p className="px-4 py-3 text-sm text-muted">Đang tải…</p>
        ) : reviews.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">Không còn lời chê nào chưa xử lý.</p>
        ) : (
          <ul className="notebook">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-rule px-4 py-3 first:border-t-0">
                <p className="line-clamp-2">
                  {newIds.has(r.id) && <span className="sign mr-2">Mới</span>}
                  <span className="hand">{r.content}</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatDate(r.created_at)} · {SOURCE_LABEL[r.source] ?? r.source}
                  {r.rating && <> · <span className="num">{r.rating}</span>/5 sao</>}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-rule p-3">
          <Link href={href} className="btn w-full">{count ? `Xử lý ${count} lời chê` : "Xem lời chê đã xử lý"}</Link>
        </div>
      </div>
    </section>
  );
}
