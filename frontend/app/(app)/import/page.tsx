"use client";

import { SectionRow, StatusLine } from "@/components/section-row";
import { useStores } from "@/components/store-context";
import { api, can, json } from "@/lib/api";
import Link from "next/link";
import { useState } from "react";

type Status = { ok: boolean; text: string } | null;

export default function ImportPage() {
  const { store } = useStores();
  const [fileStatus, setFileStatus] = useState<Status>(null);
  const [manualStatus, setManualStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<"file" | "manual" | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setBusy("file");
    setFileStatus(null);
    try {
      const r = await api<{ imported: number; skipped: number }>(`/stores/${store!.id}/reviews/import`, {
        method: "POST",
        body: new FormData(formEl),
      });
      setFileStatus({ ok: true, text: `Đã nhập ${r.imported} đánh giá, bỏ qua ${r.skipped} dòng trùng hoặc trống.` });
      formEl.reset();
    } catch (err) {
      setFileStatus({ ok: false, text: (err as Error).message });
    }
    setBusy(null);
  }

  async function addManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    setBusy("manual");
    setManualStatus(null);
    try {
      await api(`/stores/${store!.id}/reviews`, json("POST", {
        content: f.get("content"),
        author: f.get("author") || null,
        rating: f.get("rating") ? Number(f.get("rating")) : null,
      }));
      setManualStatus({ ok: true, text: "Đã thêm. Kết quả phân tích có trong trang Đánh giá." });
      formEl.reset();
    } catch (err) {
      setManualStatus({ ok: false, text: (err as Error).message });
    }
    setBusy(null);
  }

  if (!can(store, "manager"))
    return (
      <div className="max-w-md">
        <h1 className="text-[22px] leading-7 font-semibold">Nhập dữ liệu</h1>
        <p className="mt-1 text-muted">Chỉ quản lý hoặc chủ quán được nhập đánh giá. Nhờ chủ quán đổi vai trò nếu bạn cần làm việc này.</p>
      </div>
    );

  return (
    <div>
      <h1 className="text-[22px] leading-7 font-semibold">Nhập dữ liệu</h1>
      <p className="mt-1 mb-4 text-[15px] text-muted">Đánh giá mới được phân tích ngay sau khi nhập vào {store?.name}.</p>

      <SectionRow title="Import từ file" description={<>
        <p>File CSV hoặc Excel, tối đa 5MB và 10.000 dòng.</p>
        <p>Cột bắt buộc <code className="text-ink">content</code>. Cột tùy chọn: <code className="text-ink">rating</code> (1–5),{" "}
          <code className="text-ink">author</code>, <code className="text-ink">source</code>, <code className="text-ink">created_at</code>,{" "}
          <code className="text-ink">external_id</code>.</p>
        <p>Dòng có <code className="text-ink">external_id</code> đã nhập trước đó sẽ được bỏ qua, nên có thể import lại cùng một file.</p>
      </>}>
        <form onSubmit={upload} className="space-y-4">
          <div>
            <label htmlFor="file" className="label">File đánh giá</label>
            <input id="file" name="file" type="file" required accept=".csv,.xlsx,.xls"
              className="input py-2 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-active file:px-2 file:py-0.5 file:text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button disabled={busy === "file"} className="btn btn-primary">{busy === "file" ? "Đang tải lên…" : "Tải lên và phân tích"}</button>
            <StatusLine status={fileStatus} />
          </div>
        </form>
      </SectionRow>

      <SectionRow title="Nhập tay" description={<>
        <p>Cho góp ý khách nói trực tiếp với nhân viên hoặc ghi trong sổ góp ý.</p>
        <p>Khách tự gửi được qua mã QR, xem ở trang <Link href="/stores" className="font-medium text-accent hover:underline">Cửa hàng</Link>.</p>
      </>}>
        <form onSubmit={addManual} className="space-y-4">
          <div>
            <label htmlFor="content" className="label">Nội dung góp ý</label>
            <textarea id="content" name="content" required minLength={2} maxLength={2000} rows={4} className="input h-auto py-2" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="author" className="label">Tên khách</label>
              <input id="author" name="author" maxLength={200} className="input" aria-describedby="author-hint" />
              <p id="author-hint" className="mt-1 text-xs text-muted">Không bắt buộc</p>
            </div>
            <div>
              <label htmlFor="rating" className="label">Số sao</label>
              <select id="rating" name="rating" className="input">
                <option value="">Không chấm</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} sao</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button disabled={busy === "manual"} className="btn">{busy === "manual" ? "Đang lưu…" : "Thêm góp ý"}</button>
            <StatusLine status={manualStatus} />
          </div>
        </form>
      </SectionRow>
    </div>
  );
}
