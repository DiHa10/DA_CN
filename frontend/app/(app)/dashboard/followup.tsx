"use client";

// Sau khi phân tích: quán đã làm gì, có hiệu quả không (mốc cải thiện), và khách chê vào lúc nào (góp ý QR theo giờ).
import { api, json, type Action, type Summary } from "@/lib/api";
import { ASPECT_LABEL, formatDate, formatPct } from "@/lib/labels";
import { useState } from "react";
import { Busy } from "@/components/dots";

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
                <span className="num flex size-6 items-center justify-center rounded-sm bg-navy text-xs font-semibold text-cream">{numbers.get(a.id)}</span>
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
// thang một màu đỏ, nhạt -> đậm theo tỉ lệ chê; mức đậm dùng chữ kem
const LEVELS = [
  { max: 0.25, bg: "#f6e0da", ink: "#2b3140", label: "dưới 25%" },
  { max: 0.5, bg: "#e9a99e", ink: "#2b3140", label: "25–50%" },
  { max: 0.75, bg: "#c8584a", ink: "#fcf9f0", label: "50–75%" },
  { max: Infinity, bg: "#8f241b", ink: "#fcf9f0", label: "từ 75%" },
];
const level = (rate: number) => LEVELS.find((l) => rate < l.max)!;

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
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] table-fixed border-separate border-spacing-0.5 text-center text-xs">
              <caption className="sr-only">Số góp ý có lời chê trên tổng góp ý QR, theo khung giờ và thứ</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-24" />
                  {DAYS.map((d, i) => <th key={d} scope="col" className="pb-1 font-normal text-muted"><abbr title={DAY_NAMES[i]} className="no-underline">{d}</abbr></th>)}
                </tr>
              </thead>
              <tbody>
                {cells.map((row, s) => (
                  <tr key={slots[s]}>
                    <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap text-muted">{slots[s]}</th>
                    {row.map((c, d) => {
                      const tone = c.total >= MIN_CELL ? level(c.negative / c.total) : null;
                      const text = c.total ? `${c.negative}/${c.total}` : "";
                      return (
                        <td key={d} title={c.total ? `${slots[s]} ${DAY_NAMES[d]}: ${c.negative} trên ${c.total} góp ý có lời chê` : undefined}
                          className={`num h-9 rounded-sm ${tone ? "" : "bg-raised text-muted"}`}
                          style={tone ? { background: tone.bg, color: tone.ink } : undefined}>
                          {text || <span aria-label="không có góp ý">·</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <li>Tỉ lệ chê:</li>
            {LEVELS.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-4 rounded-sm" style={{ background: l.bg }} />{l.label}
              </li>
            ))}
            <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-4 rounded-sm bg-raised" />dưới {MIN_CELL} góp ý</li>
          </ul>
        </>
      )}
    </section>
  );
}
