"use client";

import { Mark, Wordmark } from "@/components/mark";
import { Icon3D } from "@/components/icon3d";
import { NegativeAlertProvider, useNegativeAlert } from "@/components/negative-alert";
import { StoreProvider, useStores } from "@/components/store-context";
import { api, can, type Summary } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/labels";
import { CircleHelp, Columns3, ExternalLink, LayoutDashboard, LogOut, MessagesSquare, QrCode, Store, Upload, UserRound } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// desc: hiện khi rê chuột (title), cho chủ quán mới dùng
const NAV = [
  { href: "/dashboard", label: "Tổng quan", desc: "Số liệu và việc cần làm", icon: LayoutDashboard },
  { href: "/reviews", label: "Đánh giá", desc: "Đọc, trả lời, xử lý lời chê", icon: MessagesSquare },
  { href: "/compare", label: "So sánh", desc: "Đặt các quán cạnh nhau", icon: Columns3, multiStore: true },
  { href: "/import", label: "Nhập dữ liệu", desc: "Thêm đánh giá từ file", icon: Upload, min: "manager" as const },
  { href: "/stores", label: "Cửa hàng", desc: "Mã QR, thành viên, báo cáo tuần", icon: Store },
];

// mục điều hướng theo vai trò ở quán đang chọn; "So sánh" chỉ có nghĩa khi có từ 2 quán
function useNav() {
  const { stores, store } = useStores();
  return NAV.filter((n) => (!n.min || can(store, n.min)) && (!n.multiStore || (stores?.length ?? 0) >= 2));
}

/*
 * Khung chữ L nền đá ấm: menu trái 228px + thanh trên 48px, không kẻ giữa hai phần.
 * Nội dung nằm trên một tờ trắng cách mép phải và mép dưới 8px, viền 1px, bo 16px, không bóng.
 * Điện thoại: không còn khung, tờ trắng là cả màn hình; thanh trên 56px + thanh điều hướng dưới.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <NegativeAlertProvider>
      <div className="min-h-screen bg-surface md:grid md:grid-cols-[228px_1fr] md:grid-rows-[48px_1fr] md:bg-ground">
        <Sidebar />
        <TopBar />
        <main className="min-w-0 px-4 pt-5 pb-24 md:mr-2 md:mb-2 md:rounded-2xl md:border md:border-border md:bg-surface md:px-6 md:pt-6 md:pb-10">
          <div className="mx-auto max-w-[1280px]"><StoreGate>{children}</StoreGate></div>
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

const ITEM = "flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-[14px] transition-colors duration-150";
// mục đang chọn: một bậc tông xám và chữ đậm, không tô màu
const itemState = (active: boolean) => (active ? "bg-active font-medium text-ink" : "text-muted hover:bg-active/60 hover:text-ink");

function Sidebar() {
  const pathname = usePathname();
  const logout = useLogout();
  const { newIds } = useNegativeAlert();
  const nav = useNav();
  const { store } = useStores();
  const accountActive = pathname.startsWith("/account");
  return (
    <aside className="hidden md:sticky md:top-0 md:row-span-2 md:flex md:h-screen md:flex-col md:overflow-y-auto md:px-3">
      <Link href="/gioi-thieu" aria-label="Quán Nghe: cách hoạt động" className="flex h-12 shrink-0 items-center px-2.5">
        <Wordmark />
      </Link>
      {/* quán đang xem và quyền của mình ở quán đó: các nút bị ẩn theo vai trò, người dùng cần biết vì sao */}
      {store && (
        <div className="mt-2 px-2.5">
          <p className="truncate text-[14px] font-medium" title={store.name}>{store.name}</p>
          <p className="text-[12px] text-muted">{ROLE_LABEL[store.role] ?? store.role}</p>
        </div>
      )}
      <nav aria-label="Điều hướng chính" className="mt-4 flex flex-col gap-0.5">
        {nav.map(({ href, label, desc, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Fragment key={href}>
            <Link href={href} title={desc} aria-current={active ? "page" : undefined} className={`${ITEM} ${itemState(active)}`}>
              <Icon aria-hidden strokeWidth={1.75} className="size-[18px] shrink-0" />
              {label}
            </Link>
            {href === "/reviews" && newIds.size > 0 && (
              <Link href="/reviews?sentiment=negative"
                className="ml-7 flex h-8 items-center justify-between rounded-sm px-2.5 text-[13px] text-muted hover:bg-active/60 hover:text-ink">
                Tiêu cực mới
                <span key={newIds.size} className="pop sign num">{newIds.size}</span>
              </Link>
            )}
            </Fragment>
          );
        })}
      </nav>
      {store && <WeekStats storeId={store.id} />}
      <div className="mt-auto flex flex-col gap-0.5 pt-3 pb-1">
        {store && (
          <a href={`/r/${store.slug}`} target="_blank" rel="noreferrer" className={SUB_LINK}>
            <ExternalLink aria-hidden strokeWidth={1.75} className="size-4" /> Form góp ý của khách
          </a>
        )}
        <Link href="/stores" className={SUB_LINK}><QrCode aria-hidden strokeWidth={1.75} className="size-4" /> Mã QR để in</Link>
        <Link href="/gioi-thieu" className={SUB_LINK}><CircleHelp aria-hidden strokeWidth={1.75} className="size-4" /> Cách hoạt động</Link>
      </div>
      <div className="mb-3 flex flex-col gap-0.5 border-t border-border pt-2">
        <Link href="/account" aria-current={accountActive ? "page" : undefined} className={`${ITEM} ${itemState(accountActive)}`}>
          <UserRound aria-hidden strokeWidth={1.75} className="size-[18px]" /> Tài khoản
        </Link>
        <button onClick={logout} className={`${ITEM} cursor-pointer text-muted hover:bg-active/60 hover:text-ink`}>
          <LogOut aria-hidden strokeWidth={1.75} className="size-[18px]" /> Đăng xuất
        </button>
      </div>
    </aside>
  );
}

const SUB_LINK = "flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-[13px] text-muted transition-colors duration-150 hover:bg-active/60 hover:text-ink";

// 7 ngày qua của quán đang xem: nhìn được tình hình ở mọi trang, bấm vào mở đúng danh sách
function WeekStats({ storeId }: { storeId: number }) {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<Summary>(`/stores/${storeId}/dashboard?days=7&brief=true`).then((d) => alive && setData(d), () => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [storeId]);
  if (!data) return null;
  const from = `date_from=${data.since}&hidden=false`;
  return (
    <section aria-label="7 ngày qua" className="mt-6 px-2.5">
      <p className="text-[12px] text-muted">7 ngày qua</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <Link href={`/reviews?${from}`} className="group rounded-sm">
          <span className="figure block text-[22px] leading-7 group-hover:underline">{data.total}</span>
          <span className="text-[12px] text-muted">đánh giá</span>
        </Link>
        <Link href={`/reviews?sentiment=negative&${from}`} className="group rounded-sm">
          <span className={`figure block text-[22px] leading-7 group-hover:underline ${data.sentiment.negative ? "text-negative" : ""}`}>
            {data.sentiment.negative}
          </span>
          <span className="text-[12px] text-muted">tiêu cực</span>
        </Link>
      </div>
    </section>
  );
}

function TopBar() {
  const { stores, store, select } = useStores();
  const logout = useLogout();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-ground px-4 md:static md:h-12 md:border-0 md:pr-2 md:pl-0">
      <Link href="/gioi-thieu" aria-label="Quán Nghe: cách hoạt động" className="flex size-11 items-center md:hidden"><Mark className="size-6" /></Link>
      {stores && stores.length > 0 && (
        <>
          <label htmlFor="store-select" className="sr-only">Cửa hàng</label>
          <select id="store-select" className="control min-w-0 max-w-80 flex-1 font-medium md:h-8 md:flex-none" value={store?.id}
            onChange={(e) => select(Number(e.target.value))}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </>
      )}
      {store && (
        <a href={`/r/${store.slug}`} target="_blank" rel="noreferrer"
          className="ml-auto hidden items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] font-medium text-muted hover:bg-active/60 hover:text-ink md:flex">
          Form góp ý của khách <ExternalLink aria-hidden strokeWidth={2} className="size-4" />
        </a>
      )}
      <Link href="/account" aria-label="Tài khoản"
        className="ml-auto flex size-11 items-center justify-center rounded-sm text-muted hover:text-ink md:hidden">
        <UserRound aria-hidden strokeWidth={1.75} className="size-5" />
      </Link>
      <button onClick={logout} aria-label="Đăng xuất"
        className="flex size-11 cursor-pointer items-center justify-center rounded-sm text-muted hover:text-ink md:hidden">
        <LogOut aria-hidden strokeWidth={1.75} className="size-5" />
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
            className={`flex h-16 flex-col items-center justify-center gap-1 text-[12px] ${active ? "font-medium text-ink" : "text-muted"}`}>
            <span className={`relative flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-active" : ""}`}>
              <Icon aria-hidden strokeWidth={active ? 2 : 1.75} className="size-5" />
              {href === "/reviews" && newIds.size > 0 && (
                <span key={newIds.size} className="pop num absolute -top-1 right-0.5 rounded-full bg-negative px-1.5 text-[11px] leading-4 font-medium text-white">
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
        <p className="mb-5 text-muted">Tạo cửa hàng đầu tiên để nhận đánh giá qua mã QR và import từ Google Maps.</p>
        <Link href="/stores" className="btn btn-primary btn-go">Tạo cửa hàng</Link>
      </div>
    );
  return children;
}
