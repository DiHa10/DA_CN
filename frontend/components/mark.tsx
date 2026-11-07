// Logo "Quán Nghe": cặp ngoặc kép, lời khách được quán lắng nghe
export const PRODUCT_NAME = "Quán Nghe";

export function Mark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className}>
      <path fill="var(--gold)" d="M2 11.5C2 7.4 4.3 4.6 8 3.5l.8 1.6C6.6 6 5.5 7.6 5.4 9.6H8.5V16H2v-4.5Zm9.5 0c0-4.1 2.3-6.9 6-8l.8 1.6c-2.2.9-3.3 2.5-3.4 4.5H18V16h-6.5v-4.5Z" />
    </svg>
  );
}

export function Wordmark() {
  return (
    // luôn nằm trên nền tối: ngoặc kép vàng đồng, tên viết bằng chữ có chân như tên tờ báo
    <span className="flex items-center gap-2.5 font-display text-[22px] font-medium tracking-[-0.01em] text-cream">
      <Mark />
      {PRODUCT_NAME}
    </span>
  );
}
