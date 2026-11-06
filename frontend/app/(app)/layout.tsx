"use client";

import { Mark, Wordmark } from "@/components/mark";
import { Icon3D } from "@/components/icon3d";
import { NegativeAlertProvider, useNegativeAlert } from "@/components/negative-alert";
import { StoreProvider, useStores } from "@/components/store-context";
import { can } from "@/lib/api";
import { Columns3, ExternalLink, LayoutDashboard, LogOut, MessagesSquare, Store, Upload, UserRound } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/reviews", label: "Đánh giá", icon: MessagesSquare },
  { href: "/compare", label: "So sánh", icon: Columns3, multiStore: true },
  { href: "/import", label: "Nhập dữ liệu", icon: Upload, min: "manager" as const },
  { href: "/stores", label: "Cửa hàng", icon: Store },
];

// mục điều hướng theo vai trò ở quán đang chọn; "So sánh" chỉ có nghĩa khi có từ 2 quán
function useNav() {
  const { stores, store } = useStores();
  return NAV.filter((n) => (!n.min || can(store, n.min)) && (!n.multiStore || (stores?.length ?? 0) >= 2));
}

/*
 * Khung chữ L tối (sidebar 236px + top bar 56px, nền xanh đen) ôm vùng nội dung nền kem, như ô cửa sáng đèn.
 * Không viền, không bóng giữa khung và nội dung: hai mảng màu tự tách nhau.
 * Điện thoại: top bar 56px + thanh điều hướng dưới, cùng nền tối.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <NegativeAlertProvider>
      <div className="min-h-screen md:grid md:grid-cols-[236px_1fr] md:grid-rows-[56px_1fr] md:bg-navy">
        <Sidebar />
        <TopBar />
        <main className="min-w-0 bg-ground px-4 pt-6 pb-24 md:px-8 md:pt-8 md:pb-10">
          <StoreGate>{children}</StoreGate>
        </main>
        <BottomNav />
      </div>
      </NegativeAlertProvider>
    </StoreProvider>
  );
}

function useLogout() {
  const router = useRouter();
  return async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  };
}

function Sidebar() {
  const pathname = usePathname();
  const logout = useLogout();
  const { newIds } = useNegativeAlert();
  const nav = useNav();
  return (
    <aside className="on-dark hidden md:sticky md:top-0 md:row-span-2 md:flex md:h-screen md:flex-col md:px-4">
      <Link href="/gioi-thieu" aria-label="Quán Nghe: cách hoạt động" className="flex h-14 items-center px-2">
        <Wordmark />
      </Link>
      <nav aria-label="Điều hướng chính" className="mt-6 flex flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Fragment key={href}>
            <Link href={href} aria-current={active ? "page" : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-sm border px-2.5 text-[13px] font-medium tracking-[0.06em] uppercase transition-colors duration-150 ${
                active ? "border-white text-cream" : "border-transparent text-on-dark-muted hover:text-cream"}`}>
              <Icon aria-hidden strokeWidth={1.5} className="size-4" />
              {label}
            </Link>
            {href === "/reviews" && newIds.size > 0 && (
              <Link href="/reviews?sentiment=negative"
                className="ml-[26px] flex h-8 items-center justify-between px-2.5 text-[13px] text-on-dark-muted transition-colors duration-150 hover:text-cream">
                Tiêu cực mới
                <span key={newIds.size} className="pop num rounded-sm bg-gold px-1.5 text-xs font-semibold text-navy">{newIds.size}</span>
              </Link>
            )}
            </Fragment>
          );
        })}
      </nav>
      <Link href="/account" aria-current={pathname.startsWith("/account") ? "page" : undefined}
        className={`mt-auto flex h-9 items-center gap-2.5 rounded-sm border px-2.5 text-[13px] font-medium tracking-[0.06em] uppercase transition-colors duration-150 ${
          pathname.startsWith("/account") ? "border-white text-cream" : "border-transparent text-on-dark-muted hover:text-cream"}`}>
        <UserRound aria-hidden strokeWidth={1.5} className="size-4" /> Tài khoản
      </Link>
      <button onClick={logout}
        className="mb-5 flex h-9 cursor-pointer items-center gap-2.5 px-2.5 text-[13px] font-medium tracking-[0.06em] text-on-dark-muted uppercase transition-colors duration-150 hover:text-cream">
        <LogOut aria-hidden strokeWidth={1.5} className="size-4" /> Đăng xuất
      </button>
    </aside>
  );
}

function TopBar() {
  const { stores, store, select } = useStores();
  const logout = useLogout();
  return (
    <header className="on-dark sticky top-0 z-10 flex h-14 items-center gap-3 px-4 md:static md:px-8">
      <Link href="/gioi-thieu" aria-label="Quán Nghe: cách hoạt động" className="flex size-11 items-center md:hidden"><Mark /></Link>
      {stores && stores.length > 0 && (
        <>
          <label htmlFor="store-select" className="sr-only">Cửa hàng</label>
          <select id="store-select" className="control min-w-0 max-w-72 flex-1 border-on-dark-muted bg-navy font-medium text-cream md:flex-none" value={store?.id}
            onChange={(e) => select(Number(e.target.value))}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </>
      )}
      {store && (
        <a href={`/r/${store.slug}`} target="_blank" rel="noreferrer"
          className="ml-auto hidden items-center gap-1.5 text-[13px] font-medium tracking-[0.06em] text-on-dark-muted uppercase hover:text-gold md:flex">
          Form đánh giá của khách <ExternalLink aria-hidden strokeWidth={1.5} className="size-3.5" />
        </a>
      )}
      <Link href="/account" aria-label="Tài khoản"
        className="ml-auto flex size-11 items-center justify-center text-on-dark-muted hover:text-cream md:hidden">
        <UserRound aria-hidden strokeWidth={1.5} className="size-5" />
      </Link>
      <button onClick={logout} aria-label="Đăng xuất"
        className="flex size-11 cursor-pointer items-center justify-center text-on-dark-muted hover:text-cream md:hidden">
        <LogOut aria-hidden strokeWidth={1.5} className="size-5" />
      </button>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const { newIds } = useNegativeAlert();
  const nav = useNav();
  return (
    <nav aria-label="Điều hướng chính" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
      className="on-dark fixed inset-x-0 bottom-0 z-10 grid md:hidden">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] tracking-[0.04em] ${active ? "font-semibold text-gold" : "text-on-dark-muted"}`}>
            <span className="relative">
              <Icon aria-hidden strokeWidth={active ? 2 : 1.5} className="size-5" />
              {href === "/reviews" && newIds.size > 0 && (
                <span key={newIds.size} className="pop num absolute -top-1.5 left-3.5 rounded-sm bg-gold px-1 text-[11px] leading-4 font-semibold text-navy">
                  {newIds.size}<span className="sr-only"> đánh giá tiêu cực mới</span>
                </span>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// Các trang cần cửa hàng thì nhắc tạo cửa hàng trước
function StoreGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { stores } = useStores();
  if (pathname.startsWith("/stores")) return children;
  if (!stores) return <p className="text-muted">Đang tải…</p>;
  if (!stores.length)
    return (
      <div className="max-w-md">
        <Icon3D name="rocket" size={96} className="mb-4" />
        <h1 className="title mb-2">Chưa có cửa hàng</h1>
        <p className="mb-4 text-muted">Tạo cửa hàng đầu tiên để nhận đánh giá qua mã QR và import từ Google Maps.</p>
        <Link href="/stores" className="btn btn-primary btn-go">Tạo cửa hàng</Link>
      </div>
    );
  return children;
}
