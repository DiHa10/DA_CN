"use client";

import { StatusLine } from "@/components/section-row";
import { api, json, type Store } from "@/lib/api";
import { useState } from "react";

type Status = { ok: boolean; text: string } | null;

// Báo cáo tuần qua email: gửi 8:00 sáng thứ Hai (giờ VN), tổng kết tuần trước.
export function ReportSettings({ store, onSaved }: { store: Store; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState(store.report_email ?? "");
  const [enabled, setEnabled] = useState(store.weekly_report);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [status, setStatus] = useState<Status>(null);

  async function run(kind: "save" | "test", fn: () => Promise<string>) {
    setBusy(kind);
    setStatus(null);
    try {
      setStatus({ ok: true, text: await fn() });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    }
    setBusy(null);
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run("save", async () => {
      await api(`/stores/${store.id}/report-settings`, json("PUT", { report_email: email.trim() || null, weekly_report: enabled }));
      await onSaved();
      return enabled ? "Đã lưu. Báo cáo gửi lúc 8:00 sáng thứ Hai hằng tuần." : "Đã lưu. Báo cáo tuần đang tắt.";
    });
  };

  const sendTest = () =>
    run("test", async () => (await api<{ message: string }>(`/stores/${store.id}/report/test`, { method: "POST" })).message);

  const id = `report-email-${store.id}`;
  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label htmlFor={id} className="label">Email nhận báo cáo</label>
        <input id={id} type="email" maxLength={255} className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-0">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Gửi mỗi sáng thứ Hai lúc 8:00
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" disabled={busy !== null}>{busy === "save" ? "Đang lưu…" : "Lưu"}</button>
        <button type="button" className="btn" onClick={sendTest} disabled={busy !== null || !store.report_email}
          title={store.report_email ? undefined : "Lưu email trước"}>
          {busy === "test" ? "Đang gửi…" : "Gửi thử báo cáo tuần trước"}
        </button>
      </div>
      <StatusLine status={status} />
    </form>
  );
}
