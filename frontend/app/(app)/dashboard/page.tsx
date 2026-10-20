"use client";

import { useNegativeAlert } from "@/components/negative-alert";
import { useStores } from "@/components/store-context";
import { api, type AspectRow, type Review, type Summary } from "@/lib/api";
import {
  ACCENT, ASPECT_LABEL, formatDate, formatNum, formatPct, SENTIMENT_COLOR, SENTIMENT_LABEL, SOURCE_LABEL,
} from "@/lib/labels";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Câu hỏi của màn hình: "Khách đang chê điều gì nhiều nhất?" — bảng khía cạnh là khối lớn nhất.
const MIN_MENTIONS = 3; // khía cạnh ít lượt nhắc quá thì tỉ lệ không đáng tin
const negRate = (a: AspectRow) => (a.total ? a.negative / a.total : 0);
const pct0 = (r: number) => `${Math.round(r * 100)}%`;

export default function DashboardPage() {
  const { store } = useStores();
  const [data, setData] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Review[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!store) return;
    setError("");
    Promise.all([
      api<Summary>(`/stores/${store.id}/dashboard`),
      api<Review[]>(`/stores/${store.id}/reviews?sentiment=negative&limit=5`),
    ]).then(([s, r]) => { setData(s); setRecent(r); }, (e) => setError(e.message));
  }, [store]);
  useEffect(load, [load]);

  const aspects = [...(data?.aspects ?? [])]
    .filter((a) => a.total >= MIN_MENTIONS)
    .sort((a, b) => negRate(b) - negRate(a));
  const worst = aspects.find((a) => a.negative > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-[22px] leading-7 font-semibold">Tổng quan</h1>
          <p className="mt-1 text-[15px] text-muted">
            {!data ? "Đang tải dữ liệu…"
              : worst ? <>Khách chê <b className="font-medium text-ink">{ASPECT_LABEL[worst.aspect] ?? worst.aspect}</b> nhiều nhất: {pct0(negRate(worst))} lượt nhắc là tiêu cực.</>
              : "Chưa có khía cạnh nào bị chê."}
          </p>
        </div>
        <Link href="/import" className="btn btn-primary">Nhập đánh giá</Link>
      </header>

      {error && (
        <p role="alert" className="text-sm">
          Không tải được dữ liệu: {error}.{" "}
          <button onClick={load} className="cursor-pointer font-medium text-accent hover:underline">Thử lại</button>
        </p>
      )}

      {data && data.analyzed === 0 && (
        <div className="rounded-lg border border-dashed border-control px-4 py-3 text-sm text-muted">
          Chưa có đánh giá nào. Import file từ Google Maps hoặc in mã QR ở trang Cửa hàng để khách gửi góp ý.
        </div>
      )}

      {data && data.analyzed > 0 && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
          <div className="min-w-0 space-y-6">
            <Kpis data={data} />
            <AspectBoard aspects={aspects} />
            <Trend data={data} />
          </div>
          <RecentNegative reviews={recent} />
        </div>
      )}
    </div>
  );
}

function Kpis({ data }: { data: Summary }) {
  const s = data.sentiment;
  const since = new Date(Date.now() - 28 * 86400e3).toISOString().slice(0, 10);
  const last4 = data.trend.filter((w) => w.week_start > since).reduce((n, w) => n + w.positive + w.neutral + w.negative, 0);
  const pending = data.total - data.analyzed;
  const cells = [
    {
      label: "Đánh giá",
      value: data.total.toLocaleString("vi-VN"),
      note: pending ? `${pending} đang chờ phân tích` : `${last4} trong 4 tuần gần nhất`,
    },
    { label: "Tích cực", value: formatPct(s.positive, data.analyzed), note: `${s.positive} đánh giá` },
    { label: "Tiêu cực", value: formatPct(s.negative, data.analyzed), note: `${s.negative} đánh giá` },
    {
      label: "Điểm sao trung bình",
      value: data.avg_rating === null ? "—" : formatNum(data.avg_rating, 2),
      unit: data.avg_rating === null ? undefined : "/5",
      note: `từ ${data.rated} lượt chấm sao`,
    },
  ];
  return (
    <section aria-label="Chỉ số chính" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="bg-surface px-5 py-4">
          <p className="text-sm text-muted">{c.label}</p>
          <p className="num mt-1 text-[28px] leading-9">
            {c.value}{c.unit && <span className="ml-0.5 text-sm text-muted">{c.unit}</span>}
          </p>
          <p className="text-xs text-muted">{c.note}</p>
        </div>
      ))}
    </section>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {(["negative", "neutral", "positive"] as const).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-3 rounded-sm" style={{ background: SENTIMENT_COLOR[k] }} />
          {SENTIMENT_LABEL[k]}
        </li>
      ))}
    </ul>
  );
}

// Dấu ấn riêng: mỗi khía cạnh một thanh chê | trung lập | khen, kèm lời chê gần nhất của khách
function AspectBoard({ aspects }: { aspects: AspectRow[] }) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-base font-semibold">Khách nói gì về từng khía cạnh</h2>
          <p className="text-xs text-muted">Xếp theo tỉ lệ tiêu cực, cao nhất trước</p>
        </div>
        <Legend />
      </div>
      {aspects.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Chưa đủ dữ liệu: mỗi khía cạnh cần ít nhất {MIN_MENTIONS} lượt nhắc.</p>
      ) : (
        <ul className="mt-2 pb-2">
          {aspects.map((a) => {
            const label = ASPECT_LABEL[a.aspect] ?? a.aspect;
            return (
              <li key={a.aspect} className="border-t border-rule px-5 py-3 first:border-t-0">
                <div className="grid grid-cols-[116px_minmax(0,1fr)_44px] items-center gap-3 sm:gap-4 sm:grid-cols-[132px_minmax(0,1fr)_72px]">
                  <Link href={`/reviews?aspect=${a.aspect}&sentiment=negative`} className="truncate font-medium hover:underline">
                    {label} <span className="num font-normal text-muted">{a.total}</span>
                  </Link>
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-sm" role="img"
                    aria-label={`${label}: ${a.negative} tiêu cực, ${a.neutral} trung lập, ${a.positive} tích cực`}>
                    {(["negative", "neutral", "positive"] as const).map((k) => a[k] > 0 && (
                      <span key={k} style={{ flexGrow: a[k], background: SENTIMENT_COLOR[k] }} />
                    ))}
                  </div>
                  <p className="num text-right">
                    <span className={a.negative ? "font-medium text-negative" : "text-muted"}>{pct0(negRate(a))}</span>
                  </p>
                </div>
                {a.latest_negative && (
                  <p className="mt-1.5 truncate text-[13px] text-muted sm:ml-[148px]">
                    “{a.latest_negative.content}” <span className="whitespace-nowrap">· {formatDate(a.latest_negative.created_at)}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Trend({ data }: { data: Summary }) {
  const points = data.trend.map((w) => {
    const n = w.positive + w.neutral + w.negative;
    return { week: w.week_start, label: formatDate(w.week_start).slice(0, 5), rate: n ? (w.negative / n) * 100 : 0, neg: w.negative, n };
  });
  const avg = (data.sentiment.negative / data.analyzed) * 100;
  // mốc tròn, mốc trên cùng cao hơn giá trị lớn nhất để đường không chạm mép
  const step = Math.max(avg, ...points.map((p) => p.rate)) > 40 ? 20 : 10;
  const top = (Math.floor(Math.max(avg, ...points.map((p) => p.rate)) / step) + 1) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const axis = { stroke: "transparent", tick: { fill: "#5d5f60", fontSize: 12 } };

  return (
    <section className="panel px-5 pt-4 pb-3">
      <h2 className="text-base font-semibold">Tỉ lệ đánh giá tiêu cực theo tuần</h2>
      <p className="text-xs text-muted">Đường nét đứt: trung bình toàn bộ {formatNum(avg)}%</p>
      <div className="mt-3 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#e5e5e5" vertical={false} />
            <XAxis dataKey="label" {...axis} tickLine={false} minTickGap={24} />
            <YAxis domain={[0, top]} ticks={ticks} unit="%" {...axis} tickLine={false} />
            <ReferenceLine y={avg} stroke="#5d5f60" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ stroke: "#cdced1" }}
              contentStyle={{ border: "1px solid #e8eaec", borderRadius: 6, fontSize: 13, padding: "6px 10px" }}
              labelFormatter={(_, p) => (p[0] ? `Tuần từ ${formatDate(p[0].payload.week)}` : "")}
              formatter={(_, __, p) => [`${formatNum(p.payload.rate)}% (${p.payload.neg}/${p.payload.n} đánh giá)`, "Tiêu cực"]}
            />
            <Line type="linear" dataKey="rate" stroke={ACCENT} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function RecentNegative({ reviews }: { reviews: Review[] | null }) {
  const { newIds } = useNegativeAlert();
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">Tiêu cực gần đây</h2>
      <div className="panel">
        {!reviews ? (
          <p className="px-4 py-3 text-sm text-muted">Đang tải…</p>
        ) : reviews.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted">Chưa có đánh giá tiêu cực nào.</p>
        ) : (
          <ul>
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-rule px-4 py-3 first:border-t-0">
                <p className="line-clamp-2">
                  {newIds.has(r.id) && <span className="mr-2 rounded bg-[#ffedea] px-1.5 text-xs font-medium text-[#831c1e]">Mới</span>}
                  {r.content}
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
          <Link href="/reviews?sentiment=negative" className="btn w-full">Xem tất cả đánh giá tiêu cực</Link>
        </div>
      </div>
    </section>
  );
}
