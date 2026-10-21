"use client";

import { MembersSettings } from "@/components/members-settings";
import { ReportSettings } from "@/components/report-settings";
import { SectionRow } from "@/components/section-row";
import { useStores } from "@/components/store-context";
import { api, json, type Store } from "@/lib/api";
import { ExternalLink } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Fragment, useEffect, useState } from "react";

// "Phở Ngon Quận 1" -> "pho-ngon-quan-1"
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

export default function StoresPage() {
  const { stores, reload, select } = useStores();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const store = await api<Store>("/stores", json("POST", { name, slug }));
      await reload();
      select(store.id);
      setName("");
      setSlug("");
      setSlugTouched(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(s: Store) {
    if (!confirm(`Xóa cửa hàng "${s.name}" và toàn bộ đánh giá của nó? Không thể hoàn tác.`)) return;
    try {
      await api(`/stores/${s.id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function downloadQr(s: Store) {
    const canvas = document.getElementById(`qr-${s.id}`) as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${s.slug}.png`;
    a.click();
  }

  return (
    <div>
      <h1 className="text-[22px] leading-7 font-semibold">Cửa hàng</h1>
      <p className="mt-1 mb-4 text-[15px] text-muted">
        {stores ? `${stores.length} cửa hàng. Mỗi cửa hàng có một form góp ý riêng cho khách quét QR.` : "Đang tải…"}
      </p>

      {stores?.map((s) => {
        const url = `${origin}/r/${s.slug}`;
        return (
          <Fragment key={s.id}>
          <SectionRow title={s.name} description={<>
            <p>In mã QR đặt ở bàn hoặc quầy thu ngân. Khách quét, chấm sao và viết góp ý; hệ thống tự phân tích.</p>
            <a href={url} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-1 break-all font-medium text-accent hover:underline">
              {url} <ExternalLink aria-hidden strokeWidth={1.5} className="size-3.5 flex-none" />
            </a>
          </>}>
            <div className="flex flex-wrap items-center gap-5">
              {origin && (
                <div className="rounded-md bg-surface p-2">
                  <QRCodeCanvas id={`qr-${s.id}`} value={url} size={132} marginSize={1} role="img" aria-label={`Mã QR mở ${url}`} />
                </div>
              )}
              <div className="flex flex-col items-start gap-3">
                <button className="btn" onClick={() => downloadQr(s)}>Tải mã QR (PNG)</button>
                {s.role === "owner" && (
                  <button className="tap cursor-pointer text-sm font-medium text-negative hover:underline" onClick={() => remove(s)}>
                    Xóa cửa hàng
                  </button>
                )}
              </div>
            </div>
          </SectionRow>
          {s.role === "owner" && (
            <>
              <SectionRow title={stores.length > 1 ? `Báo cáo tuần · ${s.name}` : "Báo cáo tuần qua email"} description={<>
                <p>Gửi lúc 8:00 sáng thứ Hai, tổng kết tuần trước: số đánh giá mới, tỉ lệ tiêu cực so với tuần trước đó, khía cạnh đang bị chê tăng và vài góp ý tiêu cực tiêu biểu.</p>
                <p>Có gợi ý cải thiện thì email kèm câu ưu tiên số một.</p>
              </>}>
                <ReportSettings store={s} onSaved={reload} />
              </SectionRow>
              <SectionRow title={stores.length > 1 ? `Thành viên · ${s.name}` : "Thành viên"} description={<>
                <p><b className="font-medium text-ink">Chủ quán:</b> toàn quyền, kể cả cài đặt, thành viên và xóa quán.</p>
                <p><b className="font-medium text-ink">Quản lý:</b> nhập đánh giá, xuất Excel, tạo gợi ý AI.</p>
                <p><b className="font-medium text-ink">Nhân viên:</b> xem và trả lời đánh giá.</p>
                <p>Người được thêm phải đăng ký tài khoản trước.</p>
              </>}>
                <MembersSettings store={s} />
              </SectionRow>
            </>
          )}
          </Fragment>
        );
      })}

      <SectionRow title="Thêm cửa hàng" description={<p>Đường dẫn là phần cuối của link form góp ý, chỉ gồm chữ thường không dấu, số và dấu gạch ngang.</p>}>
        <form onSubmit={create} className="space-y-4">
          <div>
            <label htmlFor="name" className="label">Tên cửa hàng</label>
            <input id="name" required maxLength={200} className="input" value={name}
              onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
          </div>
          <div>
            <label htmlFor="slug" className="label">Đường dẫn</label>
            <input id="slug" required pattern="[a-z0-9\-]{3,100}" className="input" value={slug} aria-describedby="slug-hint"
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} />
            <p id="slug-hint" className="mt-1 text-xs break-all text-muted">{origin}/r/{slug || "…"}</p>
          </div>
          {error && <p role="alert" className="text-sm text-negative">{error}</p>}
          <button className="btn">Tạo cửa hàng</button>
        </form>
      </SectionRow>
    </div>
  );
}
