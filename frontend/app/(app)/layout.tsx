"use client";

import { Mark, Wordmark } from "@/components/mark";
import { NegativeAlertProvider, useNegativeAlert } from "@/components/negative-alert";
import { StoreProvider, useStores } from "@/components/store-context";
import { can } from "@/lib/api";
import { Columns3, ExternalLink, LayoutDashboard, LogOut, MessagesSquare, Store, Upload } from "lucide-react";
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
 * Khung chữ L (sidebar 228px + top bar 48px) cùng nền --ground, không kẻ ranh giới giữa hai phần.
 * Tấm trắng nằm sát sidebar và top bar, cách mép phải và mép dưới cửa sổ 8px, bo 16px, viền 1px, không bóng.
 * Điện thoại: bỏ khung, tấm trắng chiếm cả màn hình, top bar 48px + thanh điều hướng dưới.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <NegativeAlertProvider>
      <div className="min-h-screen md:grid md:grid-cols-[228px_1fr] md:grid-rows-[48px_1fr]">
        <Sidebar />
        <TopBar />
        <main className="min-w-0 bg-surface px-4 pt-5 pb-24 md:mr-2 md:mb-2 md:rounded-2xl md:border md:border-border md:p-6">
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
    <aside className="hidden md:sticky md:top-0 md:row-span-2 md:flex md:h-screen md:flex-col md:px-3">
      <div className="flex h-12 items-center px-2">
        <Wordmark />
      </div>
      <nav aria-label="Điều hướng chính" className="mt-4 flex flex-col gap-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Fragment key={href}>
            <Link href={href} aria-current={active ? "page" : undefined}
              className={`flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors duration-150 ${
                active ? "bg-active font-medium text-ink" : "text-muted hover:bg-raised hover:text-ink"}`}>
              <Icon aria-hidden strokeWidth={1.5} className="size-4" />
              {label}
            </Link>
            {href === "/reviews" && newIds.size > 0 && (
              <Link href="/reviews?sentiment=negative"
                className="ml-[26px] flex h-8 items-center justify-between rounded-lg px-2.5 text-sm text-muted transition-colors duration-150 hover:bg-raised hover:text-ink">
                Tiêu cực mới
                <span className="num rounded bg-[#ffedea] px-1.5 text-xs font-medium text-[#831c1e]">{newIds.size}</span>
              </Link>
            )}
            </Fragment>
          );
        })}
      </nav>
      <button onClick={logout}
        className="mt-auto mb-4 flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted transition-colors duration-150 hover:bg-raised hover:text-ink">
        <LogOut aria-hidden strokeWidth={1.5} className="size-4" /> Đăng xuất
      </button>
    </aside>
  );
}

function TopBar() {
  const { stores, store, select } = useStores();
  const logout = useLogout();
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-3 bg-ground px-4 md:static md:px-0 md:pr-4">
      <span className="md:hidden"><Mark /></span>
      {stores && stores.length > 0 && (
        <>
          <label htmlFor="store-select" className="sr-only">Cửa hàng</label>
          <select id="store-select" className="control min-w-0 max-w-64 flex-1 font-medium md:flex-none" value={store?.id}
            onChange={(e) => select(Number(e.target.value))}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </>
      )}
      {store && (
        <a href={`/r/${store.slug}`} target="_blank" rel="noreferrer"
          className="ml-auto hidden items-center gap-1.5 text-sm text-muted hover:text-ink md:flex">
          Form đánh giá của khách <ExternalLink aria-hidden strokeWidth={1.5} className="size-3.5" />
        </a>
      )}
      <button onClick={logout} aria-label="Đăng xuất"
        className="ml-auto flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-raised md:hidden">
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
      className="fixed inset-x-0 bottom-0 z-10 grid border-t border-border bg-ground md:hidden">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex h-14 flex-col items-center justify-center gap-1 text-xs ${active ? "font-medium text-ink" : "text-muted"}`}>
            <span className="relative">
              <Icon aria-hidden strokeWidth={active ? 2 : 1.5} className="size-5" />
              {href === "/reviews" && newIds.size > 0 && (
                <span className="num absolute -top-1.5 left-3.5 rounded bg-negative px-1 text-[11px] leading-4 font-medium text-white">
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
        <h1 className="mb-1 text-[22px] font-semibold">Chưa có cửa hàng</h1>
        <p className="mb-4 text-muted">Tạo cửa hàng đầu tiên để nhận đánh giá qua mã QR và import từ Google Maps.</p>
        <Link href="/stores" className="btn btn-primary">Tạo cửa hàng</Link>
      </div>
    );
  return children;
}
