"use client";

// Biểu đồ trang Tổng quan (ECharts). Mỗi biểu đồ trả lời một câu hỏi của chủ quán, ghi ngay trên tiêu đề;
// màu: chê đỏ, trung lập xám, khen xanh dương (xem SENTIMENT_COLOR), sao vàng sẫm.
import { AXIS_TEXT, EChart, GRID_LINE, TOOLTIP, type EOption } from "@/components/echart";
import type { Action, AspectRow, Summary } from "@/lib/api";
import { ACCENT, ASPECT_LABEL, formatDate, formatNum, formatPct, SENTIMENT_COLOR, SENTIMENT_LABEL, SOURCE_COLOR, SOURCE_LABEL, STAR_COLOR } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { actionNumbers } from "./followup";

const C = SENTIMENT_COLOR;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); // lời khách đưa vào tooltip HTML
const pct1 = (n: number, d: number) => (d ? (n / d) * 100 : 0);
const ORDER = ["negative", "neutral", "positive"] as const; // chê | trung lập | khen, đúng thứ tự đọc của các thanh

/* ---------- 1. Chỉ số chính, có so với kỳ trước ---------- */

// mũi tên và màu theo tốt/xấu: tỉ lệ tiêu cực tăng là xấu (đỏ), tỉ lệ tích cực tăng là tốt (xanh lá)
function Delta({ diff, unit, digits = 1, good }: { diff: number | null; unit: string; digits?: number; good?: "up" | "down" }) {
  if (diff === null) return null;
  const flat = Math.abs(diff) < 10 ** -digits / 2;
  const better = good && !flat && (diff > 0) === (good === "up");
  const color = flat || !good ? "text-muted" : better ? "text-positive" : "text-negative";
  return (
    <span className={`num font-medium ${color}`}>
      {flat ? "không đổi" : `${diff > 0 ? "▲" : "▼"} ${formatNum(Math.abs(diff), digits)}${unit}`}
    </span>
  );
}

export function Kpis({ data, rangeLabel }: { data: Summary; rangeLabel: string }) {
  const s = data.sentiment;
  const p = data.previous;
  const prevOk = p && p.analyzed > 0;
  const pending = data.total - data.analyzed;
  const cells = [
    {
      label: "Đánh giá", value: data.total.toLocaleString("vi-VN"),
      delta: p ? <Delta diff={data.total - p.total} unit="" digits={0} /> : null,
      note: pending ? `${pending} đang chờ phân tích` : null,
    },
    { label: "Tích cực", value: formatPct(s.positive, data.analyzed), delta: prevOk ? <Delta diff={pct1(s.positive, data.analyzed) - pct1(p.sentiment.positive, p.analyzed)} unit=" điểm" good="up" /> : null, note: `${s.positive} đánh giá` },
    { label: "Tiêu cực", value: formatPct(s.negative, data.analyzed), delta: prevOk ? <Delta diff={pct1(s.negative, data.analyzed) - pct1(p.sentiment.negative, p.analyzed)} unit=" điểm" good="down" /> : null, note: `${s.negative} đánh giá` },
    {
      label: "Điểm sao trung bình", value: data.avg_rating === null ? "—" : formatNum(data.avg_rating, 2), unit: data.avg_rating === null ? "" : "/5",
      delta: p && data.avg_rating !== null && p.avg_rating !== null ? <Delta diff={data.avg_rating - p.avg_rating} unit="" digits={2} good="up" /> : null,
      note: `từ ${data.rated} lượt chấm`,
    },
  ];
  return (
    <section aria-label="Chỉ số chính">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border xl:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="bg-surface px-4 py-3.5">
            <p className="text-sm text-muted">{c.label}</p>
            <p className="figure mt-0.5 text-[28px] leading-9 whitespace-nowrap">{c.value}{c.unit && <span className="ml-0.5 text-sm text-muted">{c.unit}</span>}</p>
            <p className="text-xs text-muted">{c.delta}{c.delta && c.note && " · "}{c.note}</p>
          </div>
        ))}
      </div>
      {p && <p className="mt-1.5 text-xs text-muted">▲▼: so với {rangeLabel.toLowerCase()} liền trước ({p.total} đánh giá). Xanh lá là tốt lên, đỏ là xấu đi.</p>}
    </section>
  );
}

/* ---------- 2. Khách cảm thấy thế nào: vành khuyên + phân bố số sao ---------- */

export function MoodCard({ data }: { data: Summary }) {
  const s = data.sentiment;
  const donut = useMemo<EOption>(() => ({
    tooltip: { ...TOOLTIP, trigger: "item", formatter: (p: { name: string; value: number; percent: number }) => `${p.name}: <b>${p.value}</b> đánh giá (${formatNum(p.percent)}%)` },
    series: [{
      type: "pie", radius: ["64%", "88%"], padAngle: 1.5, itemStyle: { borderRadius: 3 }, label: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: ORDER.map((k) => ({ name: SENTIMENT_LABEL[k], value: s[k], itemStyle: { color: C[k] } })),
    }],
  }), [s]);
  const stars = useMemo<EOption>(() => ({
    grid: { left: 44, right: 40, top: 4, bottom: 4 },
    tooltip: { ...TOOLTIP, trigger: "item", formatter: (p: { name: string; value: number }) => `${p.name}: <b>${p.value}</b> lượt (${formatPct(p.value, data.rated)})` },
    xAxis: { type: "value", show: false, max: Math.max(1, ...data.rating_dist) },
    yAxis: { type: "category", inverse: true, data: ["5 sao", "4 sao", "3 sao", "2 sao", "1 sao"], axisLine: { show: false }, axisTick: { show: false }, axisLabel: AXIS_TEXT },
    series: [{
      type: "bar", barWidth: 12, data: [...data.rating_dist].reverse(),
      itemStyle: { color: STAR_COLOR, borderRadius: [0, 3, 3, 0] },
      showBackground: true, backgroundStyle: { color: "#f3f2ef", borderRadius: 3 },
      label: { show: true, position: "right", color: "#5d5f60", fontSize: 12 },
    }],
  }), [data.rating_dist, data.rated]);

  return (
    <section className="panel px-5 pt-4 pb-4">
      <h2 className="heading">Khách cảm thấy thế nào</h2>
      <p className="text-xs text-muted">Máy đọc lời khách (trái) và số sao khách tự chấm (phải)</p>
      <div className="mt-3 grid items-center gap-6 sm:grid-cols-2">
        <div className="flex items-center gap-4">
          <div className="relative w-[148px] shrink-0">
            <EChart option={donut} height={148}
              label={`Tích cực ${formatPct(s.positive, data.analyzed)}, trung lập ${formatPct(s.neutral, data.analyzed)}, tiêu cực ${formatPct(s.negative, data.analyzed)} trên ${data.analyzed} đánh giá`} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="figure text-[24px] leading-7">{data.analyzed}</span>
              <span className="text-[11px] text-muted">đánh giá</span>
            </div>
          </div>
          <ul className="min-w-0 space-y-2 text-sm">
            {[...ORDER].reverse().map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: C[k] }} />
                <span className="text-muted">{SENTIMENT_LABEL[k]}</span>
                <span className="num ml-auto font-medium">{formatPct(s[k], data.analyzed)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm">
            <span className="figure text-[22px]">{data.avg_rating === null ? "—" : formatNum(data.avg_rating, 2)}</span>
            <span className="text-muted"> sao trung bình · {data.rated} lượt chấm</span>
          </p>
          {data.rated > 0
            ? <EChart option={stars} height={124} label={data.rating_dist.map((n, i) => `${i + 1} sao: ${n}`).join(", ")} />
            : <p className="mt-2 text-sm text-muted">Chưa có lượt chấm sao nào trong khoảng này.</p>}
        </div>
      </div>
    </section>
  );
}

/* ---------- 3. Khía cạnh: thanh hai phía, chê sang trái, khen sang phải ---------- */

export function AspectChart({ aspects, since }: { aspects: AspectRow[]; since: string | null }) {
  const router = useRouter();
  const option = useMemo<EOption>(() => {
    const p = (a: AspectRow, k: "negative" | "neutral" | "positive") => (a.total ? (a[k] / a.total) * 100 : 0);
    const label = (pos: "left" | "right") => ({
      show: true, position: pos, color: "#131416", fontSize: 12,
      formatter: (x: { value: number }) => (Math.abs(x.value) >= 1 ? `${Math.round(Math.abs(x.value))}%` : ""),
    });
    const bar = { type: "bar", barWidth: 16, emphasis: { focus: "series" } };
    // thanh gần chạm mép (>= 80%): ghi số vào trong thanh, nếu không nhãn đè lên tên khía cạnh
    const inside = (v: number, position: string) => (Math.abs(v) >= 80 ? { value: v, label: { position, color: "#ffffff" } } : v);
    return {
      grid: { left: 8, right: 48, top: 36, bottom: 8, containLabel: true },
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: AXIS_TEXT, data: ["Chê", "Trung lập", "Khen"] },
      tooltip: {
        ...TOOLTIP, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(19,20,22,0.04)" } }, // taste-skill-ignore: dải tô cột đang rê chuột, không phải đổ bóng
        formatter: (ps: { dataIndex: number }[]) => {
          const a = aspects[ps[0].dataIndex];
          const q = a.latest_negative ? `<div style="margin-top:6px;max-width:280px;white-space:normal;font-style:italic;color:#5d5f60">“${esc(a.latest_negative.content.slice(0, 140))}”</div>` : "";
          return `<b>${ASPECT_LABEL[a.aspect] ?? a.aspect}</b> · ${a.total} lượt nhắc<br/>`
            + `<span style="color:${C.negative}">●</span> Chê ${a.negative} (${Math.round(p(a, "negative"))}%)<br/>`
            + `<span style="color:#9a9c9f">●</span> Trung lập ${a.neutral}<br/>`
            + `<span style="color:${C.positive}">●</span> Khen ${a.positive} (${Math.round(p(a, "positive"))}%)${q}`;
        },
      },
      xAxis: {
        type: "value", min: -100, max: 100, interval: 50, splitLine: GRID_LINE,
        axisLabel: { ...AXIS_TEXT, formatter: (v: number) => `${Math.abs(v)}%` },
      },
      yAxis: {
        type: "category", inverse: true, axisTick: { show: false }, axisLine: { show: false },
        data: aspects.map((a) => a.aspect), axisLabel: { ...AXIS_TEXT, color: "#131416", fontSize: 13, formatter: (v: string) => ASPECT_LABEL[v] ?? v },
      },
      // trung lập chia đôi quanh vạch 0 để tổng hai phía vẫn là 100%
      series: [
        { ...bar, name: "Trung lập", stack: "l", itemStyle: { color: C.neutral }, data: aspects.map((a) => -p(a, "neutral") / 2),
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: "#8f9195", type: "solid" }, data: [{ xAxis: 0 }] } },
        { ...bar, name: "Chê", stack: "l", itemStyle: { color: C.negative, borderRadius: [3, 0, 0, 3] }, label: label("left"), data: aspects.map((a) => inside(-p(a, "negative"), "insideLeft")) },
        { ...bar, name: "Trung lập", stack: "r", itemStyle: { color: C.neutral }, data: aspects.map((a) => p(a, "neutral") / 2) },
        { ...bar, name: "Khen", stack: "r", itemStyle: { color: C.positive, borderRadius: [0, 3, 3, 0] }, label: label("right"), data: aspects.map((a) => inside(p(a, "positive"), "insideRight")) },
      ],
    };
  }, [aspects]);

  // một review chê nhiều khía cạnh là lời chê gần nhất của cả mấy khía cạnh đó: chỉ hiện một lần
  const quotes = aspects.filter((a, i) => a.latest_negative
    && aspects.findIndex((b) => b.latest_negative?.content === a.latest_negative!.content) === i).slice(0, 3);
  return (
    <section className="panel px-5 pt-4 pb-4">
      <h2 className="heading">Khách khen, chê từng khía cạnh ra sao</h2>
      <p className="text-xs text-muted">Bị chê nhiều nhất nằm trên cùng. Rê chuột để xem số lượt và lời chê gần nhất; bấm vào thanh để mở các đánh giá đó.</p>
      {aspects.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Chưa đủ dữ liệu: mỗi khía cạnh cần ít nhất 3 lượt nhắc.</p>
      ) : (
        <EChart option={option} height={60 + aspects.length * 38}
          label={aspects.map((a) => `${ASPECT_LABEL[a.aspect] ?? a.aspect}: chê ${formatPct(a.negative, a.total)}, khen ${formatPct(a.positive, a.total)}`).join("; ")}
          onClick={(e) => {
            const sentiment = e.seriesName === "Khen" ? "positive" : e.seriesName === "Chê" ? "negative" : "neutral";
            router.push(`/reviews?aspect=${aspects[e.dataIndex].aspect}&sentiment=${sentiment}${since ? `&date_from=${since}` : ""}`);
          }} />
      )}
      {quotes.length > 0 && (
        <ul className="notebook mt-3 space-y-1.5 pl-3">
          {quotes.map((a) => (
            <li key={a.aspect} className="truncate text-sm">
              <span className="font-medium">{ASPECT_LABEL[a.aspect] ?? a.aspect}:</span>{" "}
              <span className="hand">{a.latest_negative!.content}</span>{" "}
              <span className="text-xs whitespace-nowrap text-muted">· {formatDate(a.latest_negative!.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- 4. Xu hướng theo tuần: số lượng / tỉ lệ tiêu cực / điểm sao ---------- */

const TABS = [["count", "Số đánh giá"], ["neg", "Tỉ lệ tiêu cực"], ["star", "Điểm sao"]] as const;
type Tab = (typeof TABS)[number][0];
const VISIBLE_WEEKS = 16; // nhiều tuần hơn thì kéo thanh bên dưới để xem

export function TrendChart({ data, actions }: { data: Summary; actions: Action[] }) {
  const [tab, setTab] = useState<Tab>("count");
  const weeks = data.trend.map((w) => ({ ...w, n: w.positive + w.neutral + w.negative, label: formatDate(w.week_start).slice(0, 5) }));
  // mốc cải thiện: vạch dọc ở tuần chứa ngày áp dụng (tuần bắt đầu thứ Hai), số khớp khối "Việc quán đã thay đổi"
  const numbers = actionNumbers(actions);
  const marks = actions.flatMap((a) => {
    const d = new Date(`${a.day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const w = weeks.find((x) => x.week_start === d.toISOString().slice(0, 10));
    return w ? [{ xAxis: w.label, label: { formatter: String(numbers.get(a.id)) } }] : [];
  });
  const negAvg = pct1(data.sentiment.negative, data.analyzed);

  const option = useMemo<EOption>(() => {
    const zoom = weeks.length > VISIBLE_WEEKS;
    const actionLine = marks.length ? {
      markLine: { silent: true, symbol: "none", lineStyle: { color: ACCENT, width: 1.5, type: "solid" },
        label: { position: "end", color: ACCENT, fontWeight: 600, fontSize: 12 }, data: marks },
    } : {};
    const base = {
      grid: { left: 8, right: 16, top: tab === "count" ? 36 : 20, bottom: zoom ? 44 : 8, containLabel: true },
      xAxis: { type: "category", data: weeks.map((w) => w.label), axisTick: { show: false }, axisLine: { lineStyle: { color: "#e6e4df" } }, axisLabel: AXIS_TEXT },
      dataZoom: zoom ? [
        { type: "inside", startValue: weeks.length - VISIBLE_WEEKS, endValue: weeks.length - 1 },
        { type: "slider", height: 18, bottom: 6, startValue: weeks.length - VISIBLE_WEEKS, endValue: weeks.length - 1,
          borderColor: "#e6e4df", fillerColor: "rgba(27,108,128,0.12)", handleStyle: { color: ACCENT }, textStyle: AXIS_TEXT, showDetail: false },
      ] : [],
    };
    const title = (i: number) => `Tuần từ ${formatDate(weeks[i].week_start)}`;
    if (tab === "count") {
      return {
        ...base,
        legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: AXIS_TEXT },
        tooltip: {
          ...TOOLTIP, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(19,20,22,0.04)" } }, // taste-skill-ignore: dải tô cột đang rê chuột, không phải đổ bóng
          formatter: (ps: { dataIndex: number }[]) => {
            const w = weeks[ps[0].dataIndex];
            return `<b>${title(ps[0].dataIndex)}</b> · ${w.n} đánh giá<br/>`
              + [...ORDER].reverse().map((k) => `<span style="color:${C[k]}">●</span> ${SENTIMENT_LABEL[k]} ${w[k]}`).join("<br/>");
          },
        },
        yAxis: { type: "value", minInterval: 1, splitLine: GRID_LINE, axisLabel: AXIS_TEXT },
        series: ORDER.map((k, i) => ({
          name: SENTIMENT_LABEL[k], type: "bar", stack: "n", barMaxWidth: 28, data: weeks.map((w) => w[k]),
          itemStyle: { color: C[k], borderRadius: i === 2 ? [3, 3, 0, 0] : 0 },
          ...(i === 0 ? actionLine : {}),
        })),
      };
    }
    if (tab === "neg") {
      const rates = weeks.map((w) => (w.n ? Math.round((w.negative / w.n) * 1000) / 10 : null));
      return {
        ...base,
        tooltip: { ...TOOLTIP, trigger: "axis", formatter: (ps: { dataIndex: number }[]) => {
          const w = weeks[ps[0].dataIndex];
          return `<b>${title(ps[0].dataIndex)}</b><br/>Tiêu cực ${formatPct(w.negative, w.n)} (${w.negative}/${w.n} đánh giá)`;
        } },
        yAxis: { type: "value", min: 0, max: 100, interval: 25, splitLine: GRID_LINE, axisLabel: { ...AXIS_TEXT, formatter: "{value}%" } },
        series: [{
          name: "Tiêu cực", type: "line", data: rates, connectNulls: true, symbol: "circle", symbolSize: 6,
          lineStyle: { color: C.negative, width: 2 }, itemStyle: { color: C.negative }, areaStyle: { color: "rgba(179,54,43,0.08)" },
          markLine: {
            silent: true, symbol: "none",
            data: [
              { yAxis: Math.round(negAvg * 10) / 10, lineStyle: { color: "#8f9195", type: "dashed" },
                label: { formatter: `TB ${formatNum(negAvg)}%`, position: "insideEndTop", color: "#5d5f60", fontSize: 11 } },
              ...marks.map((m) => ({ ...m, lineStyle: { color: ACCENT, width: 1.5, type: "solid" }, label: { ...m.label, position: "end", color: ACCENT, fontWeight: 600 } })),
            ],
          },
        }],
      };
    }
    return {
      ...base,
      tooltip: { ...TOOLTIP, trigger: "axis", formatter: (ps: { dataIndex: number }[]) => {
        const w = weeks[ps[0].dataIndex];
        return `<b>${title(ps[0].dataIndex)}</b><br/>${w.avg_rating === null ? "Không có lượt chấm sao" : `${formatNum(w.avg_rating, 2)} sao (${w.rated} lượt chấm)`}`;
      } },
      yAxis: { type: "value", min: 1, max: 5, interval: 1, splitLine: GRID_LINE, axisLabel: { ...AXIS_TEXT, formatter: "{value} sao" } },
      series: [{
        name: "Điểm sao", type: "line", data: weeks.map((w) => w.avg_rating), connectNulls: true, symbol: "circle", symbolSize: 6,
        lineStyle: { color: STAR_COLOR, width: 2 }, itemStyle: { color: STAR_COLOR },
        ...(data.avg_rating !== null ? { markLine: { silent: true, symbol: "none", data: [{ yAxis: data.avg_rating, lineStyle: { color: "#8f9195", type: "dashed" },
          label: { formatter: `TB ${formatNum(data.avg_rating, 2)}`, position: "insideEndTop", color: "#5d5f60", fontSize: 11 } }] } } : {}),
      }],
    };
  }, [tab, data, actions]); // eslint-disable-line react-hooks/exhaustive-deps -- weeks/marks suy ra từ data, actions

  const last = weeks.at(-1);
  const summary = tab === "count"
    ? `Số đánh giá mỗi tuần, chia theo khen, trung lập, chê; ${weeks.length} tuần${last ? `, tuần gần nhất ${last.n} đánh giá, ${last.negative} tiêu cực` : ""}`
    : tab === "neg" ? `Tỉ lệ đánh giá tiêu cực theo tuần, trung bình ${formatNum(negAvg)}%`
    : `Điểm sao trung bình theo tuần, trung bình ${data.avg_rating === null ? "chưa có" : formatNum(data.avg_rating, 2)}`;

  return (
    <section className="panel px-5 pt-4 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="heading">Xu hướng theo tuần</h2>
          <p className="text-xs text-muted">
            {tab === "count" ? "Mỗi cột là một tuần; phần đỏ là đánh giá tiêu cực" : tab === "neg" ? "Đường nét đứt: trung bình cả khoảng" : "Điểm sao khách tự chấm"}
            {marks.length > 0 && ". Vạch xanh có số: mốc quán thay đổi"}
            {weeks.length > VISIBLE_WEEKS && ". Kéo thanh dưới biểu đồ để xem các tuần trước"}
          </p>
        </div>
        <div role="group" aria-label="Chỉ số" className="flex rounded-md bg-raised p-0.5 ring-1 ring-border">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}
              className={`h-9 cursor-pointer rounded-sm px-2.5 text-[13px] md:h-7 ${tab === k ? "bg-surface font-medium text-ink ring-1 ring-border" : "text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        {weeks.length ? <EChart option={option} height={260} label={summary} /> : <p className="py-6 text-sm text-muted">Chưa có dữ liệu theo tuần.</p>}
      </div>
    </section>
  );
}

/* ---------- 5. Góp ý đến từ đâu: số đánh giá mỗi tuần theo nguồn ---------- */

const SOURCES = ["google", "qr", "csv", "manual"]; // thứ tự cố định để mỗi nguồn luôn một màu

export function SourceChart({ data }: { data: Summary }) {
  const used = SOURCES.filter((k) => data.trend.some((w) => w.sources[k]));
  const totals = used.map((k) => data.trend.reduce((n, w) => n + (w.sources[k] ?? 0), 0));
  const all = totals.reduce((a, b) => a + b, 0);
  const option = useMemo<EOption>(() => {
    const weeks = data.trend;
    const zoom = weeks.length > VISIBLE_WEEKS;
    return {
      grid: { left: 8, right: 16, top: 36, bottom: zoom ? 44 : 8, containLabel: true },
      legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: AXIS_TEXT },
      tooltip: {
        ...TOOLTIP, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(19,20,22,0.04)" } }, // taste-skill-ignore: dải tô cột đang rê chuột
        formatter: (ps: { dataIndex: number }[]) => {
          const w = weeks[ps[0].dataIndex];
          return `<b>Tuần từ ${formatDate(w.week_start)}</b><br/>`
            + used.map((k) => `<span style="color:${SOURCE_COLOR[k]}">●</span> ${SOURCE_LABEL[k] ?? k} ${w.sources[k] ?? 0}`).join("<br/>");
        },
      },
      xAxis: { type: "category", data: weeks.map((w) => formatDate(w.week_start).slice(0, 5)), axisTick: { show: false }, axisLine: { lineStyle: { color: "#e6e4df" } }, axisLabel: AXIS_TEXT },
      yAxis: { type: "value", minInterval: 1, splitLine: GRID_LINE, axisLabel: AXIS_TEXT },
      dataZoom: zoom ? [
        { type: "inside", startValue: weeks.length - VISIBLE_WEEKS, endValue: weeks.length - 1 },
        { type: "slider", height: 18, bottom: 6, startValue: weeks.length - VISIBLE_WEEKS, endValue: weeks.length - 1, borderColor: "#e6e4df", showDetail: false },
      ] : [],
      series: used.map((k, i) => ({
        name: SOURCE_LABEL[k] ?? k, type: "bar", stack: "s", barMaxWidth: 28, data: weeks.map((w) => w.sources[k] ?? 0),
        itemStyle: { color: SOURCE_COLOR[k], borderRadius: i === used.length - 1 ? [3, 3, 0, 0] : 0 },
      })),
    };
  }, [data.trend]); // eslint-disable-line react-hooks/exhaustive-deps -- used suy ra từ data.trend

  if (!data.trend.length) return null;
  return (
    <section className="panel px-5 pt-4 pb-3">
      <h2 className="heading">Góp ý đến từ đâu</h2>
      <p className="text-xs text-muted">
        {used.map((k, i) => `${SOURCE_LABEL[k] ?? k} ${formatPct(totals[i], all)}`).join(" · ")}
        {!used.includes("qr") && ". Chưa có góp ý qua mã QR: in mã ở trang Cửa hàng để khách góp ý tại bàn"}
      </p>
      <div className="mt-2">
        <EChart option={option} height={220} label={`Số đánh giá mỗi tuần theo nguồn: ${used.map((k, i) => `${SOURCE_LABEL[k] ?? k} ${totals[i]}`).join(", ")}`} />
      </div>
    </section>
  );
}

/* ---------- 6. Cụm từ khách hay nhắc khi chê: thanh ngang, bấm để mở các đánh giá ---------- */

export function ComplaintChart({ items, since }: { items: Summary["complaints"]; since: string | null }) {
  const router = useRouter();
  const option = useMemo<EOption>(() => ({
    grid: { left: 4, right: 32, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...TOOLTIP, trigger: "item", formatter: (p: { name: string; value: number }) => `“${esc(p.name)}”: <b>${p.value}</b> đánh giá có lời chê` },
    xAxis: { type: "value", show: false, max: Math.max(1, ...items.map((c) => c.count)) },
    yAxis: { type: "category", inverse: true, data: items.map((c) => c.phrase), axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...AXIS_TEXT, color: "#131416", fontSize: 13, width: 120, overflow: "truncate" } },
    series: [{
      type: "bar", barWidth: 12, data: items.map((c) => c.count),
      itemStyle: { color: C.negative, borderRadius: [0, 3, 3, 0] },
      showBackground: true, backgroundStyle: { color: "#f3f2ef", borderRadius: 3 },
      label: { show: true, position: "right", color: "#5d5f60", fontSize: 12 },
    }],
  }), [items]);
  if (!items.length) return null;
  return (
    <section>
      <h2 className="heading mb-2">Khách hay nhắc khi chê</h2>
      <div className="panel px-3 py-2">
        <EChart option={option} height={16 + items.length * 30}
          label={items.map((c) => `${c.phrase}: ${c.count}`).join(", ")}
          onClick={(e) => router.push(`/reviews?q=${encodeURIComponent(e.name)}&complaint=true&hidden=false${since ? `&date_from=${since}` : ""}`)} />
      </div>
    </section>
  );
}
