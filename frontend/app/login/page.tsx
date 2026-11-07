"use client";

import { Wordmark } from "@/components/mark";
import { errorMessage } from "@/lib/api";
import { shake } from "@/lib/motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

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
    if (!res.ok) {
      shake(panel.current);
      return setError(errorMessage(await res.json().catch(() => ({})), res.status));
    }
    router.push(mode === "register" ? "/stores" : "/dashboard");
    router.refresh();
  }

  const isLogin = mode === "login";
  return (
    <main className="flex min-h-screen flex-col bg-ground px-5 py-6 md:px-12">
      <Link href="/gioi-thieu" aria-label="Quán Nghe: cách hoạt động" className="w-fit"><Wordmark /></Link>
      <div className="mx-auto my-auto grid w-full max-w-5xl items-center gap-10 py-10 md:grid-cols-[1fr_400px] md:gap-16">
      <div>
        <p className="text-[48px] leading-[1.05] font-bold tracking-[-0.03em] text-ink md:text-[72px]">
          <span className="line-mask"><span>Khách</span></span>
          <span className="line-mask"><span style={{ animationDelay: "120ms" }} className="text-accent">nói gì?</span></span>
        </p>
        <p style={{ animationDelay: "350ms" }} className="anim-rise mt-5 max-w-md text-[17px] leading-[1.55] text-muted md:text-[19px]">
          Đọc mọi đánh giá từ Google Maps và mã QR tại quán, biết ngay món nào được khen và điều gì cần sửa.
        </p>
      </div>
      <div ref={panel} style={{ animationDelay: "450ms" }} className="anim-rise panel w-full p-6 sm:p-8">
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
            {isLogin && <Link href="/forgot" className="tap mt-2 inline-block text-xs font-medium text-accent hover:underline">Quên mật khẩu?</Link>}
          </div>
          {error && <p role="alert" className="text-sm text-negative">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary btn-go h-11 w-full">
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
