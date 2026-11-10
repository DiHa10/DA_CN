"use client";

// Sau khi phân tích: quán đã làm gì, có hiệu quả không (mốc cải thiện), và khách chê vào lúc nào (góp ý QR theo giờ).
import { api, json, type Action, type Summary } from "@/lib/api";
import { ASPECT_LABEL, formatDate, formatPct } from "@/lib/labels";
import { useMemo, useState } from "react";
import { Busy } from "@/components/dots";
import { AXIS_TEXT, EChart, TOOLTIP, type EOption } from "@/components/echart";

const pct = (s: { mentions: number; negative: number }) => formatPct(s.negative, s.mentions);
const VERDICT = {
  better: ["Giảm rõ", "text-positive"],
  worse: ["Tăng lên", "text-negative"],
  same: ["Chưa khác biệt rõ", "text-muted"],
} as const;

// số thứ tự theo ngày áp dụng (cũ nhất là 1), dùng chung cho danh sách và vạch trên biểu đồ xu hướng
export const actionNumbers = (actions: Action[]) =>
  new Map([...actions].sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id).map((a, i) => [a.id, i + 1]));

const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

export function ActionsPanel({ storeId, actions, canEdit, onChange }: {
  storeId: number; actions: Action[]; canEdit: boolean; onChange: (list: Action[]) => void;
}) {
  const [day, setDay] = useState(todayVN);
  const [aspect, setAspect] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const numbers = actionNumbers(actions);
  const base = `/stores/${storeId}/actions`;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const a = await api<Action>(base, json("POST", { day, aspect: aspect || null, note }));
      onChange([a, ...actions].sort((x, y) => y.day.localeCompare(x.day) || y.id - x.id));
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function remove(a: Action) {
    if (!confirm(`Xóa mốc "${a.note}"?`)) return;
    try {
      await api(`${base}/${a.id}`, { method: "DELETE" });
      onChange(actions.filter((x) => x.id !== a.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="panel">
      <div className="px-5 pt-4">
        <h2 className="heading">Việc quán đã thay đổi</h2>
        <p className="text-xs text-muted">Tỉ lệ chê 4 tuần trước và 4 tuần sau ngày áp dụng. Số thứ tự khớp vạch trên biểu đồ xu hướng.</p>
      </div>
      {actions.length === 0 ? (
        <p className="px-5 py-3 text-sm text-muted">
          Chưa có mốc nào. {canEdit ? "Sửa gì trong quán (thêm người, đổi món, đổi giá...) thì ghi lại ở dưới để xem có hiệu quả không." : ""}
        </p>
      ) : (
        <ul className="mt-2">
          {actions.map((a) => {
            const [label, color] = a.verdict ? VERDICT[a.verdict] : ["", ""];
            return (
              <li key={a.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-t border-rule px-5 py-3 first:border-t-0">
                <span className="num flex size-6 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{numbers.get(a.id)}</span>
                <div className="min-w-0">
                  <p className="font-medium">{a.note}</p>
                  <p className="text-xs text-muted">
                    Từ {formatDate(a.day)} · {a.aspect ? ASPECT_LABEL[a.aspect] ?? a.aspect : "Tổng thể"}
                    {a.after_days < 28 && ` · mới qua ${a.after_days} ngày`}
                  </p>
                  <p className="mt-1 text-sm">
                    {a.enough ? (
                      <>
                        Tỉ lệ chê <span className="num">{pct(a.before)}</span> → <span className="num">{pct(a.after)}</span>
                        <span className="text-muted"> ({a.before.negative}/{a.before.mentions} → {a.after.negative}/{a.after.mentions} lượt nhắc)</span>
                        {" "}<b className={`font-medium ${color}`}>{label}</b>
                      </>
                    ) : (
                      <span className="text-muted">
                        Chưa đủ dữ liệu để kết luận: cần ít nhất 5 lượt nhắc mỗi bên (trước {a.before.mentions}, sau {a.after.mentions}).
                      </span>
                    )}
                  </p>
                  {canEdit && (
                    <button className="tap mt-1 cursor-pointer text-xs font-medium text-muted hover:text-negative" onClick={() => remove(a)}>Xóa mốc</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-rule px-5 py-4">
          <div>
            <label htmlFor="act-day" className="block text-xs text-muted">Áp dụng từ</label>
            <input id="act-day" type="date" required max={todayVN()} value={day} onChange={(e) => setDay(e.target.value)} className="control" />
          </div>
          <div>
            <label htmlFor="act-aspect" className="block text-xs text-muted">Khía cạnh</label>
            <select id="act-aspect" value={aspect} onChange={(e) => setAspect(e.target.value)} className="control">
              <option value="">Tổng thể</option>
              {Object.entries(ASPECT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="min-w-48 flex-1">
            <label htmlFor="act-note" className="block text-xs text-muted">Đã thay đổi gì</label>
            <input id="act-note" required minLength={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: thêm 1 nhân viên ca trưa" className="control w-full" />
          </div>
          <button className="btn" disabled={busy}>{busy ? <Busy text="Đang lưu" /> : "Thêm mốc"}</button>
          {error && <p role="alert" className="basis-full text-sm text-negative">{error}</p>}
        </form>
      )}
    </section>
  );
}

const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const DAY_NAMES = ["thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy", "Chủ nhật"];
const MIN_QR = 10; // ít góp ý QR quá thì bảng chỉ là vài ô lẻ
const MIN_CELL = 3; // ô ít góp ý hơn thì không tô màu: 1/1 = 100% không nói lên gì
// thang một màu đỏ, nhạt -> đậm theo tỉ lệ chê (%); mức đậm dùng chữ trắng. -1: ô dưới MIN_CELL góp ý, không tô
const LEVELS = [
  { min: 0, max: 25, bg: "#f6e0da", ink: "#2b3140", label: "dưới 25%" },
  { min: 25, max: 50, bg: "#e9a99e", ink: "#2b3140", label: "25–50%" },
  { min: 50, max: 75, bg: "#c8584a", ink: "#ffffff", label: "50–75%" },
  { min: 75, max: 101, bg: "#8f241b", ink: "#ffffff", label: "từ 75%" },
];

// Khách chê vào lúc nào: khung giờ × thứ trong tuần, chỉ từ góp ý QR (gửi ngay tại quán nên giờ gửi ~ giờ ở quán)
export function TimeHeatmap({ data }: { data: Summary["by_time"] }) {
  const { total, slots, cells } = data;
  let worst: { slot: number; day: number; rate: number; neg: number; n: number } | null = null;
  cells.forEach((row, s) => row.forEach((c, d) => {
    const rate = c.total ? c.negative / c.total : 0;
    // nhiều lời chê nhất (ô nhỏ 3/3 = 100% không nặng bằng 10/16); bằng nhau thì tỉ lệ cao hơn
    if (c.total >= MIN_CELL && c.negative > 0 && (!worst || c.negative > worst.neg || (c.negative === worst.neg && rate > worst.rate)))
      worst = { slot: s, day: d, rate, neg: c.negative, n: c.total };
  }));
  const w = worst as { slot: number; day: number; rate: number; neg: number; n: number } | null;

  const option = useMemo<EOption>(() => ({
    grid: { left: 4, right: 4, top: 4, bottom: 36, containLabel: true },
    tooltip: { ...TOOLTIP, formatter: (p: { value: [number, number, number] }) => {
      const c = cells[p.value[1]][p.value[0]];
      return `<b>${slots[p.value[1]]}, ${DAY_NAMES[p.value[0]]}</b><br/>${c.total ? `${c.negative}/${c.total} góp ý có lời chê` : "Không có góp ý"}`;
    } },
    xAxis: { type: "category", data: DAYS, position: "top", splitArea: { show: false }, axisLine: { show: false }, axisTick: { show: false }, axisLabel: AXIS_TEXT },
    yAxis: { type: "category", data: slots, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: AXIS_TEXT },
    visualMap: {
      type: "piecewise", orient: "horizontal", left: "center", bottom: 0, itemWidth: 14, itemHeight: 10, textStyle: AXIS_TEXT,
      pieces: [{ value: -1, color: "#f3f2ef", label: `dưới ${MIN_CELL} góp ý` }, ...LEVELS.map((l) => ({ gte: l.min, lt: l.max, color: l.bg, label: l.label }))],
    },
    series: [{
      type: "heatmap", itemStyle: { borderColor: "#ffffff", borderWidth: 3, borderRadius: 4 },
      emphasis: { itemStyle: { borderColor: "#131416", borderWidth: 1 } },
      data: cells.flatMap((row, si) => row.map((c, d) => {
        const v = c.total >= MIN_CELL ? Math.round((c.negative / c.total) * 100) : -1;
        const ink = v >= 50 ? "#ffffff" : v >= 0 ? "#2b3140" : "#8f9195";
        return { value: [d, si, v], label: { show: c.total > 0, color: ink, fontSize: 12, formatter: `${c.negative}/${c.total}` } };
      })),
    }],
  }), [cells, slots]);

  return (
    <section className="panel px-5 pt-4 pb-4">
      <h2 className="heading">Khách chê vào lúc nào</h2>
      <p className="text-xs text-muted">Chỉ tính góp ý qua mã QR: đánh giá Google Maps không có giờ khách ở quán.</p>
      {total < MIN_QR ? (
        <p className="mt-3 text-sm text-muted">
          Cần ít nhất {MIN_QR} góp ý qua mã QR trong khoảng này để xem theo giờ (đang có {total}).
        </p>
      ) : (
        <>
          <p className="mt-3 text-[15px]">
            {w
              ? <>Chê nhiều nhất: <b className="font-medium">{slots[w.slot].split(" ")[0]} {DAY_NAMES[w.day]}</b>, {w.neg}/{w.n} góp ý có lời chê.</>
              : "Chưa khung giờ nào có lời chê."}
          </p>
          <div className="mt-2 overflow-x-auto"><div className="min-w-[440px]">
            <EChart option={option} height={56 + slots.length * 40}
              label={`Góp ý có lời chê theo khung giờ và thứ, ${total} góp ý QR${w ? `; nhiều nhất ${slots[w.slot]} ${DAY_NAMES[w.day]}` : ""}`} />
          </div></div>
        </>
      )}
    </section>
  );
}
