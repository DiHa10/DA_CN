"use client";

import { InsightsPanel } from "@/components/insights-panel";
import { Skeleton } from "@/components/skeleton";
import { useNegativeAlert } from "@/components/negative-alert";
import { useStores } from "@/components/store-context";
import { api, can, type Action, type Anomalies, type AspectRow, type Review, type Summary } from "@/lib/api";
import { actionNumbers, ActionsPanel, TimeHeatmap } from "./followup";
import {
  ACCENT, ASPECT_LABEL, formatDate, formatNum, formatPct, SENTIMENT_COLOR, SENTIMENT_LABEL, SOURCE_LABEL,
} from "@/lib/labels";
import { AlertTriangle, CheckCircle2, MessageSquareWarning, QrCode } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
  const load = useCallback(() => {
    if (!storeId) return;
    setError("");
    // cùng mốc "từ ngày" với backend (ngày VN, tính cả hôm nay) để 3 lời chê khớp con số đếm
    const from = range === "all" ? "" : `&date_from=${new Date(Date.now() + 7 * 3600e3 - (Number(range) - 1) * 86400e3).toISOString().slice(0, 10)}`;
    Promise.all([
      api<Summary>(`/stores/${storeId}/dashboard${range === "all" ? "" : `?days=${range}`}`),
      api<Review[]>(`/stores/${storeId}/reviews?complaint=true&status=open&hidden=false&limit=3${from}`),
      api<Anomalies>(`/stores/${storeId}/dashboard/anomalies`),
      api<Action[]>(`/stores/${storeId}/actions`),
    ]).then(([s, r, a, act]) => { setData(s); setRecent(r); setAnomalies(a); setActions(act); }, (e) => setError(e.message));
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
          <p className="text-[15px] text-muted">{greeting()}</p>
          <h1 className="title">Tổng quan</h1>
          <p className="mt-1 text-[15px] text-muted">
            {!data ? "Đang tải dữ liệu…"
              : worst ? <>Khách chê <b className="font-medium text-ink">{ASPECT_LABEL[worst.aspect] ?? worst.aspect}</b> nhiều nhất: {pct0(negRate(worst))} lượt nhắc là tiêu cực.</>
              : "Chưa có khía cạnh nào bị chê."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Khoảng thời gian" className="flex rounded-sm border border-border bg-surface p-1">
            {RANGES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={range === k} onClick={() => pick(k)}
                className={`h-10 cursor-pointer rounded-[6px] px-3.5 text-[14px] font-medium transition-colors duration-150 ${
                  range === k ? "bg-accent text-white" : "text-muted hover:bg-raised hover:text-ink"}`}>
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
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
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_384px]">
          <div className="min-w-0 space-y-6">
            <Kpis data={data} rangeLabel={rangeLabel} />
            <AspectBoard aspects={aspects} since={data.since} />
            <Trend data={data} actions={actions} />
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

function greeting() {
  const h = (new Date().getUTCHours() + 7) % 24; // giờ Việt Nam
  return h < 11 ? "Chào buổi sáng" : h < 13 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

// Việc cần làm: đặt trên cùng để chủ quán mở ra là biết nên làm gì trước, rồi mới tới số liệu
function TodoCard({ anomalies, data }: { anomalies: Anomalies; data: Summary }) {
  const items: { key: string; icon: React.ReactNode; tone: string; text: React.ReactNode; href: string; action: string }[] = [];
  for (const a of anomalies.alerts) {
    items.push({
      key: `anomaly-${a.aspect ?? "all"}`,
      icon: <AlertTriangle aria-hidden className="size-5" />,
      tone: "bg-warn-soft text-warn",
      text: <>
        {a.aspect ? <><b className="font-semibold">{ASPECT_LABEL[a.aspect] ?? a.aspect}</b> bị chê bất thường</> : <b className="font-semibold">Lời chê tăng bất thường</b>}
        {": "}{pct0(a.rate)} trong 7 ngày qua ({a.negative}/{a.mentions}), thường chỉ {pct0(a.baseline_rate)}.
      </>,
      href: `/reviews?sentiment=negative&date_from=${anomalies.since}${a.aspect ? `&aspect=${a.aspect}` : ""}`,
      action: "Xem đánh giá",
    });
  }
  if (data.open_complaints > 0)
    items.push({
      key: "open",
      icon: <MessageSquareWarning aria-hidden className="size-5" />,
      tone: "bg-negative-soft text-negative",
      text: <><b className="font-semibold">{data.open_complaints} lời chê chưa xử lý</b> trong khoảng đang xem. Gọi lại khách hoặc ghi chú đã làm gì.</>,
      href: `/reviews?complaint=true&status=open&hidden=false${data.since ? `&date_from=${data.since}` : ""}`,
      action: "Xử lý",
    });
  if (data.by_time.total === 0)
    items.push({
      key: "qr",
      icon: <QrCode aria-hidden className="size-5" />,
      tone: "bg-accent-soft text-accent",
      text: <><b className="font-semibold">Chưa có góp ý qua mã QR.</b> In mã QR đặt ở bàn để khách góp ý ngay tại quán.</>,
      href: "/stores",
      action: "Lấy mã QR",
    });

  return (
    <section aria-label="Việc cần làm" className="anim-drop panel px-5 py-4">
      <h2 className="heading">Việc cần làm {items.length > 0 && <span className="num ml-1 rounded-full bg-raised px-2 py-0.5 text-[13px] text-muted">{items.length}</span>}</h2>
      {items.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-[15px] text-muted">
          <CheckCircle2 aria-hidden className="size-5 text-positive" /> Không có việc gấp. Mọi lời chê đã được xử lý.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center gap-3 rounded-sm border border-border px-3 py-2.5 sm:flex-nowrap">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${it.tone}`}>{it.icon}</span>
              <p className="min-w-0 flex-1 text-[15px]">{it.text}</p>
              <Link href={it.href} className="btn ml-auto h-10 shrink-0">{it.action}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Kpis({ data, rangeLabel }: { data: Summary; rangeLabel: string }) {
  const s = data.sentiment;
  const since = new Date(Date.now() - 28 * 86400e3).toISOString().slice(0, 10);
  const last4 = data.trend.filter((w) => w.week_start > since).reduce((n, w) => n + w.positive + w.neutral + w.negative, 0);
  const pending = data.total - data.analyzed;
  const cells = [
    {
      label: "Đánh giá",
      value: data.total.toLocaleString("vi-VN"),
      note: pending ? `${pending} đang chờ phân tích` : data.since ? `trong ${rangeLabel.toLowerCase()} qua` : `${last4} trong 4 tuần gần nhất`,
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
    <section aria-label="Chỉ số chính" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="panel px-5 py-4">
          <p className="text-sm text-muted">{c.label}</p>
          <p className="figure mt-1 text-[30px] leading-10">
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
function AspectBoard({ aspects, since }: { aspects: AspectRow[]; since: string | null }) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="heading">Khách nói gì về từng khía cạnh</h2>
          <p className="text-xs text-muted">Xếp theo tỉ lệ tiêu cực, cao nhất trước</p>
        </div>
        <Legend />
      </div>
      {aspects.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Chưa đủ dữ liệu: mỗi khía cạnh cần ít nhất {MIN_MENTIONS} lượt nhắc.</p>
      ) : (
        <ul className="notebook mt-2 pb-2">
          {aspects.map((a, i) => {
            const label = ASPECT_LABEL[a.aspect] ?? a.aspect;
            return (
              <li key={a.aspect} className="border-t border-rule px-5 py-3 first:border-t-0">
                <div className="grid grid-cols-[116px_minmax(0,1fr)_44px] items-center gap-3 sm:gap-4 sm:grid-cols-[132px_minmax(0,1fr)_72px]">
                  <Link href={`/reviews?aspect=${a.aspect}&sentiment=negative${since ? `&date_from=${since}` : ""}`} className="tap truncate font-medium hover:underline">
                    {label} <span className="num font-normal text-muted">{a.total}</span>
                  </Link>
                  <div className="grow-x flex h-2.5 gap-0.5 overflow-hidden rounded-sm" role="img" style={{ animationDelay: `${i * 40}ms` }}
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
                  <p className="mt-1 truncate sm:ml-[148px]">
                    <span className="hand">{a.latest_negative.content}</span>{" "}
                    <span className="text-xs whitespace-nowrap text-muted">· {formatDate(a.latest_negative.created_at)}</span>
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

// Xu hướng theo tuần: tỉ lệ chê (máy đọc lời khách) hoặc điểm sao (khách tự chấm), chọn bằng tab
function Trend({ data, actions }: { data: Summary; actions: Action[] }) {
  const [metric, setMetric] = useState<"neg" | "star">("neg");
  const stars = metric === "star";
  const points = data.trend.map((w) => {
    const n = w.positive + w.neutral + w.negative;
    return {
      week: w.week_start, label: formatDate(w.week_start).slice(0, 5), neg: w.negative, n, rated: w.rated,
      rate: n ? (w.negative / n) * 100 : 0, star: w.avg_rating,
    };
  });
  const negAvg = (data.sentiment.negative / data.analyzed) * 100;
  const avg = stars ? data.avg_rating : negAvg;
  // mốc tròn, mốc trên cùng cao hơn giá trị lớn nhất để đường không chạm mép
  const step = Math.max(negAvg, ...points.map((p) => p.rate)) > 40 ? 20 : 10;
  const top = (Math.floor(Math.max(negAvg, ...points.map((p) => p.rate)) / step) + 1) * step;
  const ticks = stars ? [1, 2, 3, 4, 5] : Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const axis = { stroke: "transparent", tick: { fill: "#586179", fontSize: 12 } };
  const rated = points.filter((p) => p.star !== null);
  const fmt = (v: number) => (stars ? `${formatNum(v, 2)}★` : `${formatNum(v)}%`);
  const series = stars ? rated.map((p) => p.star!) : points.map((p) => p.rate);
  // mốc cải thiện: vạch dọc ở tuần chứa ngày áp dụng (tuần bắt đầu thứ Hai), số khớp khối "Việc quán đã thay đổi"
  const numbers = actionNumbers(actions);
  const marks = actions.flatMap((a) => {
    const d = new Date(`${a.day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const p = points.find((x) => x.week === d.toISOString().slice(0, 10));
    return p ? [{ id: a.id, x: p.label, n: numbers.get(a.id)! }] : [];
  });

  return (
    <section className="panel px-5 pt-4 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="heading">{stars ? "Điểm sao trung bình theo tuần" : "Tỉ lệ đánh giá tiêu cực theo tuần"}</h2>
          <p className="text-xs text-muted">
            {avg === null ? "Chưa có lượt chấm sao nào" : `Đường nét đứt: trung bình cả khoảng ${fmt(avg)}`}
            {marks.length > 0 && ". Vạch đậm có số: mốc quán thay đổi"}
          </p>
        </div>
        <div role="group" aria-label="Chỉ số" className="flex rounded-sm border border-border p-1">
          {([["neg", "Tỉ lệ tiêu cực"], ["star", "Điểm sao"]] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)}
              className={`h-9 cursor-pointer rounded-[6px] px-3 text-[13px] font-medium ${metric === k ? "bg-accent text-white" : "text-muted hover:bg-raised hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* biểu đồ SVG không đọc được bằng trình đọc màn hình: đưa số liệu chính thành một câu */}
      <div className="mt-3 h-[200px]" role="img" aria-label={series.length
        ? `${stars ? "Điểm sao" : "Tỉ lệ tiêu cực"} theo tuần, từ ${fmt(series[0])} đến ${fmt(series.at(-1)!)}; cao nhất ${fmt(Math.max(...series))}, thấp nhất ${fmt(Math.min(...series))}`
        : "Chưa có dữ liệu theo tuần"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#e4e8ef" vertical={false} />
            <XAxis dataKey="label" {...axis} tickLine={false} minTickGap={24} />
            <YAxis domain={stars ? [1, 5] : [0, top]} ticks={ticks} unit={stars ? "" : "%"} {...axis} tickLine={false} />
            {avg !== null && <ReferenceLine y={avg} stroke="#586179" strokeDasharray="4 4" />}
            {marks.map((m) => (
              <ReferenceLine key={m.id} x={m.x} stroke={ACCENT} strokeWidth={1.5}
                label={{ value: m.n, position: "insideTopRight", fill: ACCENT, fontSize: 12, fontWeight: 600 }} />
            ))}
            <Tooltip
              cursor={{ stroke: "#858c99" }}
              contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "#ffffff", fontSize: 13, padding: "8px 12px", boxShadow: "0 4px 12px rgba(20,32,51,0.08)" }}
              labelFormatter={(_, p) => (p[0] ? `Tuần từ ${formatDate(p[0].payload.week)}` : "")}
              formatter={(_, __, p) => stars
                ? [`${formatNum(p.payload.star, 2)}★ (${p.payload.rated} lượt chấm)`, "Điểm sao"]
                : [`${formatNum(p.payload.rate)}% (${p.payload.neg}/${p.payload.n} đánh giá)`, "Tiêu cực"]}
            />
            {/* tuần không ai chấm sao thì nối qua, không kéo đường về 0 */}
            <Line type="linear" dataKey={stars ? "star" : "rate"} stroke={stars ? "#b8862f" : ACCENT} strokeWidth={2}
              dot={stars ? { r: 2 } : false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
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
