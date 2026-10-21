"use client";

import { useStores } from "@/components/store-context";
import { api, type Compare } from "@/lib/api";
import { ASPECT_LABEL, formatNum } from "@/lib/labels";
import { useEffect, useState } from "react";

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
      <h1 className="text-[22px] leading-7 font-semibold">So sánh chi nhánh</h1>
      <p className="mt-1 text-[15px] text-muted">
        Tỉ lệ đánh giá tiêu cực {data.days} ngày qua. Chữ đỏ đậm: tệ hơn mức chung của mọi chi nhánh (từ {MIN_MENTIONS} lượt nhắc trở lên).
      </p>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border">
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
