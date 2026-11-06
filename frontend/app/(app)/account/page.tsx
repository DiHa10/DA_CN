"use client";

import { SectionRow, StatusLine } from "@/components/section-row";
import { api, json } from "@/lib/api";
import { useState } from "react";

export default function AccountPage() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("new_password") !== f.get("confirm")) return setStatus({ ok: false, text: "Hai lần nhập mật khẩu mới không giống nhau" });
    setBusy(true);
    setStatus(null);
    try {
      await api("/auth/change-password", json("POST", { current_password: f.get("current_password"), new_password: f.get("new_password") }));
      form.reset();
      setStatus({ ok: true, text: "Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới." });
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <div>
      <h1 className="title">Tài khoản</h1>
      <p className="mt-1 mb-4 text-[15px] text-muted">Cài đặt đăng nhập của bạn.</p>
      <SectionRow title="Đổi mật khẩu" description={<p>Mật khẩu mới tối thiểu 8 ký tự. Quên mật khẩu hiện tại thì đăng xuất rồi chọn “Quên mật khẩu?” ở trang đăng nhập.</p>}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="current_password" className="label">Mật khẩu hiện tại</label>
            <input id="current_password" name="current_password" type="password" required autoComplete="current-password" className="input" />
          </div>
          <div>
            <label htmlFor="new_password" className="label">Mật khẩu mới</label>
            <input id="new_password" name="new_password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </div>
          <div>
            <label htmlFor="confirm" className="label">Nhập lại mật khẩu mới</label>
            <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </div>
          <button disabled={busy} className="btn btn-primary">{busy ? "Đang lưu…" : "Đổi mật khẩu"}</button>
          <StatusLine status={status} />
        </form>
      </SectionRow>
    </div>
  );
}
