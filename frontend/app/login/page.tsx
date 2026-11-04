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
    <main className="on-dark flex min-h-screen flex-col px-5 py-6 md:px-12">
      <Wordmark />
      <div className="mx-auto my-auto grid w-full max-w-5xl items-center gap-10 py-10 md:grid-cols-[1fr_400px] md:gap-16">
      <div>
        {/* chữ lớn vàng chanh trên nền tối, như biển hiệu sáng đèn */}
        <p className="text-[44px] leading-[1.02] font-normal tracking-[0.06em] text-lemon uppercase md:text-[68px]">
          Khách<br />nói gì?
        </p>
        <p className="mt-5 max-w-md text-[17px] leading-[1.45] tracking-[0.02em] text-cream md:text-[19px]">
          Đọc mọi đánh giá từ Google Maps và mã QR tại quán, biết ngay món nào được khen và điều gì cần sửa.
        </p>
      </div>
      <div className="on-light w-full bg-surface p-6 text-ink sm:p-8">
        <h1 className="title">{isLogin ? "Đăng nhập" : "Tạo tài khoản"}</h1>
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
          <button type="submit" disabled={loading} className="btn btn-primary h-11 w-full">
            {loading ? "Đang xử lý…" : isLogin ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </form>
      <p className="mt-6 text-sm text-muted">
        {isLogin ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
        <button type="button" onClick={() => { setMode(isLogin ? "register" : "login"); setError(""); }}
          className="cursor-pointer font-medium text-accent hover:underline">
          {isLogin ? "Đăng ký" : "Đăng nhập"}
        </button>
      </p>
      </div>
      </div>
    </main>
  );
}
