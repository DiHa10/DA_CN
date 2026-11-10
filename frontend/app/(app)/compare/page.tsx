"use client";

import { AXIS_TEXT, EChart, GRID_LINE, TOOLTIP, type EOption } from "@/components/echart";
import { useStores } from "@/components/store-context";
import { api, type Compare } from "@/lib/api";
import { ASPECT_LABEL, formatNum, SENTIMENT_COLOR, SERIES } from "@/lib/labels";
import { useEffect, useMemo, useState } from "react";

const MIN_MENTIONS = 3; // ít lượt nhắc quá thì tỉ lệ không đáng tin, không tô đỏ
type Rate = { mentions: number; negative_rate: number | null };

export default function ComparePage() {
  const { select } = useStores();
  const [data, setData] = useState<Compare | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Compare>("/stores/compare").then(setData, (e) => setError(e.message));
  }, []);

  if (error) return <p role="alert" className="text-negative">{error}</p>;
  if (!data) return <p className="text-muted">Đang tải…</p>;

  // chỉ những khía cạnh có dữ liệu ở ít nhất một chi nhánh, theo thứ tự cố định
  const aspects = Object.keys(ASPECT_LABEL).filter((a) => data.overall.aspects[a]?.mentions);
  const worse = (r: Rate | undefined, base: Rate | undefined) =>
    !!r && r.negative_rate !== null && base?.negative_rate != null && r.mentions >= MIN_MENTIONS && r.negative_rate > base.negative_rate;

  const cell = (r: Rate | undefined, base: Rate | undefined) =>
    !r?.mentions ? (
      <span className="text-muted">—</span>
    ) : (
      <>
        <span className={worse(r, base) ? "font-semibold text-negative" : ""}>{formatNum((r.negative_rate ?? 0) * 100, 0)}%</span>
        <span className="block text-xs text-muted">{r.mentions} lượt</span>
      </>
    );

  return (
    <div>
      <h1 className="title">So sánh chi nhánh</h1>
      <p className="mt-1 text-[15px] text-muted">
        Tỉ lệ đánh giá tiêu cực {data.days} ngày qua. Chữ đỏ đậm: tệ hơn mức chung của mọi chi nhánh (từ {MIN_MENTIONS} lượt nhắc trở lên).
      </p>

      <CompareCharts data={data} aspects={aspects} />

      <h2 className="heading mt-8 mb-2">Bảng số liệu</h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="num w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="sticky left-0 bg-surface px-4 py-2.5 text-left font-normal">Chi nhánh</th>
              <th className="px-3 py-2.5 text-right font-normal">Đánh giá</th>
              <th className="px-3 py-2.5 text-right font-normal">Tiêu cực</th>
              {aspects.map((a) => <th key={a} className="px-3 py-2.5 text-right font-normal">{ASPECT_LABEL[a]}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.stores.map((s) => (
              <tr key={s.id} className="border-t border-rule">
                <th scope="row" className="sticky left-0 bg-surface px-4 py-3 text-left font-medium">
                  <button className="tap cursor-pointer text-left hover:underline" onClick={() => select(s.id)}
                    title="Chọn chi nhánh này ở thanh trên">
                    {s.name}
                  </button>
                </th>
                <td className="px-3 py-3 text-right">{s.mentions}</td>
                <td className="px-3 py-3 text-right">{cell(s, data.overall)}</td>
                {aspects.map((a) => <td key={a} className="px-3 py-3 text-right align-top">{cell(s.aspects[a], data.overall.aspects[a])}</td>)}
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-raised">
              <th scope="row" className="sticky left-0 bg-raised px-4 py-3 text-left font-medium">Chung</th>
              <td className="px-3 py-3 text-right">{data.overall.mentions}</td>
              <td className="px-3 py-3 text-right">{cell(data.overall, undefined)}</td>
              {aspects.map((a) => <td key={a} className="px-3 py-3 text-right align-top">{cell(data.overall.aspects[a], undefined)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const pctOf = (r: Rate | undefined) => (r?.negative_rate == null ? null : Math.round(r.negative_rate * 1000) / 10);
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); // tên quán do người dùng đặt
const color = (i: number) => SERIES[i % SERIES.length]; // màu theo thứ tự quán trong danh sách, không theo hạng

// Ba câu hỏi của người quản lý nhiều quán: quán nào bị chê nhiều nhất, mỗi quán mạnh/yếu ở đâu, khía cạnh nào lệch giữa các quán
function CompareCharts({ data, aspects }: { data: Compare; aspects: string[] }) {
  const overall = pctOf(data.overall);
  const ranked = [...data.stores].filter((s) => s.mentions).sort((a, b) => (b.negative_rate ?? 0) - (a.negative_rate ?? 0));

  const ranking = useMemo<EOption>(() => ({
    grid: { left: 8, right: 56, top: 24, bottom: 8, containLabel: true },
    tooltip: { ...TOOLTIP, trigger: "item", formatter: (p: { dataIndex: number }) => {
      const s = ranked[p.dataIndex];
      return `<b>${esc(s.name)}</b><br/>Tiêu cực ${formatNum(pctOf(s) ?? 0)}% trên ${s.mentions} đánh giá`;
    } },
    xAxis: { type: "value", max: 100, splitLine: GRID_LINE, axisLabel: { ...AXIS_TEXT, formatter: "{value}%" } },
    yAxis: { type: "category", inverse: true, data: ranked.map((s) => s.name), axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { ...AXIS_TEXT, color: "#131416", fontSize: 13, width: 140, overflow: "truncate" } },
    series: [{
      type: "bar", barWidth: 14, data: ranked.map((s) => ({
        value: pctOf(s),
        // tệ hơn mức chung: đỏ; còn lại xám, để quán cần chú ý nổi lên
        itemStyle: { color: overall !== null && (pctOf(s) ?? 0) > overall ? SENTIMENT_COLOR.negative : "#9a9c9f", borderRadius: [0, 3, 3, 0] },
      })),
      label: { show: true, position: "right", color: "#131416", fontSize: 12, formatter: (p: { value: number }) => `${formatNum(p.value)}%` },
      markLine: overall === null ? undefined : { silent: true, symbol: "none", lineStyle: { color: "#5d5f60", type: "dashed" },
        label: { formatter: `Chung ${formatNum(overall)}%`, position: "start", color: "#5d5f60", fontSize: 11 }, data: [{ xAxis: overall }] },
    }],
  }), [data]); // eslint-disable-line react-hooks/exhaustive-deps -- ranked, overall suy ra từ data

  // radar: "không bị chê" = 100% - tỉ lệ chê, để hình to hơn là tốt hơn
  const radar = useMemo<EOption>(() => ({
    legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: AXIS_TEXT, type: "scroll" },
    tooltip: { ...TOOLTIP, trigger: "item" },
    radar: {
      radius: "64%", center: ["50%", "46%"], splitNumber: 4,
      indicator: aspects.map((a) => ({ name: ASPECT_LABEL[a], max: 100 })),
      axisName: { color: "#131416", fontSize: 12 },
      splitLine: { lineStyle: { color: "#e6e4df" } }, splitArea: { show: false }, axisLine: { lineStyle: { color: "#e6e4df" } },
    },
    series: [{
      type: "radar", symbolSize: 5,
      data: data.stores.map((s, i) => ({
        name: s.name,
        // chưa có lượt nhắc: bỏ trống điểm đó ("-"), không vẽ thành 0% (trông như bị chê hết)
        value: aspects.map((a) => { const v = pctOf(s.aspects[a]); return v === null ? "-" : Math.round((100 - v) * 10) / 10; }),
        lineStyle: { color: color(i), width: 2 }, itemStyle: { color: color(i) }, areaStyle: { color: color(i), opacity: 0.08 },
      })),
    }],
  }), [data, aspects]);

  const grouped = useMemo<EOption>(() => ({
    grid: { left: 8, right: 8, top: 36, bottom: 8, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: AXIS_TEXT, type: "scroll" },
    tooltip: {
      ...TOOLTIP, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: "rgba(19,20,22,0.04)" } }, // taste-skill-ignore: dải tô cột đang rê chuột
      formatter: (ps: { dataIndex: number }[]) => {
        const a = aspects[ps[0].dataIndex];
        return `<b>${ASPECT_LABEL[a]}</b><br/>` + data.stores.map((s, i) => {
          const r = s.aspects[a];
          return `<span style="color:${color(i)}">●</span> ${esc(s.name)}: ${r?.mentions ? `${formatNum(pctOf(r) ?? 0)}% (${r.mentions} lượt)` : "chưa có"}`;
        }).join("<br/>");
      },
    },
    xAxis: { type: "category", data: aspects.map((a) => ASPECT_LABEL[a]), axisTick: { show: false }, axisLine: { lineStyle: { color: "#e6e4df" } }, axisLabel: { ...AXIS_TEXT, color: "#131416" } },
    yAxis: { type: "value", max: 100, splitLine: GRID_LINE, axisLabel: { ...AXIS_TEXT, formatter: "{value}%" } },
    series: data.stores.map((s, i) => ({
      name: s.name, type: "bar", barMaxWidth: 18, barGap: "15%",
      // ít hơn MIN_MENTIONS lượt: tỉ lệ chưa đáng tin, vẽ nhạt
      data: aspects.map((a) => ({ value: pctOf(s.aspects[a]) ?? 0, itemStyle: { opacity: (s.aspects[a]?.mentions ?? 0) >= MIN_MENTIONS ? 1 : 0.35 } })),
      itemStyle: { color: color(i), borderRadius: [3, 3, 0, 0] },
    })),
  }), [data, aspects]);

  const worst = ranked[0];
  return (
    <div className="mt-5 space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel px-5 pt-4 pb-3">
          <h2 className="heading">Quán nào bị chê nhiều nhất</h2>
          <p className="text-xs text-muted">
            {worst ? <>Cao nhất: <b className="font-medium text-ink">{worst.name}</b> {formatNum(pctOf(worst) ?? 0)}%. </> : null}
            Đỏ: tệ hơn mức chung; nét đứt: mức chung của mọi quán
          </p>
          <EChart option={ranking} height={40 + ranked.length * 34}
            label={ranked.map((s) => `${s.name}: tiêu cực ${formatNum(pctOf(s) ?? 0)}%`).join("; ")} />
        </section>
        <section className="panel px-5 pt-4 pb-3">
          <h2 className="heading">Mỗi quán mạnh, yếu ở đâu</h2>
          <p className="text-xs text-muted">Tỉ lệ lượt nhắc không bị chê theo khía cạnh: hình càng rộng càng tốt</p>
          <EChart option={radar} height={300}
            label={data.stores.map((s) => `${s.name}: ${aspects.map((a) => { const v = pctOf(s.aspects[a]); return `${ASPECT_LABEL[a]} ${v === null ? "chưa có" : `${formatNum(100 - v)}%`}`; }).join(", ")}`).join("; ")} />
        </section>
      </div>
      <section className="panel px-5 pt-4 pb-3">
        <h2 className="heading">Tỉ lệ chê từng khía cạnh, theo quán</h2>
        <p className="text-xs text-muted">Cột nhạt: dưới {MIN_MENTIONS} lượt nhắc, tỉ lệ chưa đáng tin</p>
        <EChart option={grouped} height={300}
          label={aspects.map((a) => `${ASPECT_LABEL[a]}: ${data.stores.map((s) => `${s.name} ${pctOf(s.aspects[a]) ?? "chưa có"}%`).join(", ")}`).join("; ")} />
      </section>
    </div>
  );
}
