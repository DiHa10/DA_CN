"use client";

import { AuthCard } from "@/components/auth-card";
import { api, json } from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function ResetPage() {
  return <Suspense><Reset /></Suspense>;
}

function Reset() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setError("Hai lần nhập mật khẩu không giống nhau");
    setBusy(true);
    setError("");
    try {
      await api("/auth/reset", json("POST", { token, password: f.get("password") }));
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <AuthCard title="Đặt mật khẩu mới" intro="Mật khẩu tối thiểu 8 ký tự.">
      {done ? (
        <p role="status" className="text-sm">
          Đã đổi mật khẩu. <Link href="/login" className="font-medium text-accent hover:underline">Đăng nhập bằng mật khẩu mới</Link>
        </p>
      ) : !token ? (
        <p role="alert" className="text-sm">Link không đủ thông tin. Hãy mở lại link trong email, hoặc <Link href="/forgot" className="font-medium text-accent hover:underline">yêu cầu link mới</Link>.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="password" className="label">Mật khẩu mới</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </div>
          <div>
            <label htmlFor="confirm" className="label">Nhập lại mật khẩu mới</label>
            <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </div>
          {error && <p role="alert" className="text-sm text-negative">{error}</p>}
          <button disabled={busy} className="btn btn-primary btn-go h-11 w-full">{busy ? "Đang lưu…" : "Đặt mật khẩu mới"}</button>
        </form>
      )}
    </AuthCard>
  );
}
