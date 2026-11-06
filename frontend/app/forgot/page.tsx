"use client";

import { AuthCard } from "@/components/auth-card";
import { api, json } from "@/lib/api";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPage() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/forgot", json("POST", { email: new FormData(e.currentTarget).get("email") }));
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <AuthCard title="Quên mật khẩu" intro="Nhập email đăng ký, chúng tôi gửi link để đặt mật khẩu mới.">
      {sent ? (
        <p role="status" className="text-sm">
          Nếu email này có tài khoản, link đặt lại đã được gửi tới hộp thư. Link hết hạn sau 30 phút.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          {error && <p role="alert" className="text-sm text-negative">{error}</p>}
          <button disabled={busy} className="btn btn-primary btn-go h-11 w-full">{busy ? "Đang gửi…" : "Gửi link đặt lại"}</button>
        </form>
      )}
      <p className="mt-6 text-sm text-muted"><Link href="/login" className="font-medium text-accent hover:underline">Quay lại đăng nhập</Link></p>
    </AuthCard>
  );
}
