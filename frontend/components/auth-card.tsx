import { Wordmark } from "@/components/mark";
import Link from "next/link";

// Khung cho các trang tài khoản ngoài ứng dụng (quên / đặt lại mật khẩu): nền tối, tấm kem ở giữa như trang đăng nhập
export function AuthCard({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <main className="on-dark flex min-h-screen flex-col px-5 py-6 md:px-12">
      <Link href="/gioi-thieu" aria-label="Quán Nghe: cách hoạt động" className="w-fit"><Wordmark /></Link>
      <div className="anim-rise on-light mx-auto my-auto w-full max-w-sm rounded-lg bg-surface p-6 text-ink sm:p-8">
        <h1 className="title">{title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">{intro}</p>
        {children}
      </div>
    </main>
  );
}
