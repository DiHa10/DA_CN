"use client";

import { Wordmark } from "@/components/mark";
import { errorMessage } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, email: form.get("email"), password: form.get("password") }),
    });
    setLoading(false);
    if (!res.ok) return setError(errorMessage(await res.json().catch(() => ({})), res.status));
    router.push(mode === "register" ? "/stores" : "/dashboard");
    router.refresh();
  }

  const isLogin = mode === "login";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6"><Wordmark /></div>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <h1 className="text-[22px] leading-7 font-semibold">{isLogin ? "Đăng nhập" : "Tạo tài khoản"}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">
          {isLogin ? "Xem khách đang khen và chê điều gì ở quán của bạn." : "Dành cho chủ quán. Bạn sẽ tạo cửa hàng đầu tiên ngay sau bước này."}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label htmlFor="password" className="label">Mật khẩu</label>
            <input id="password" name="password" type="password" required minLength={8}
              autoComplete={isLogin ? "current-password" : "new-password"} className="input"
              aria-describedby={isLogin ? undefined : "password-hint"} />
            {!isLogin && <p id="password-hint" className="mt-1 text-xs text-muted">Tối thiểu 8 ký tự.</p>}
          </div>
          {error && <p role="alert" className="text-sm text-negative">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary h-10 w-full">
            {loading ? "Đang xử lý…" : isLogin ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </form>
      </div>
      <p className="mt-5 text-sm text-muted">
        {isLogin ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
        <button type="button" onClick={() => { setMode(isLogin ? "register" : "login"); setError(""); }}
          className="cursor-pointer font-medium text-accent hover:underline">
          {isLogin ? "Đăng ký" : "Đăng nhập"}
        </button>
      </p>
    </main>
  );
}
