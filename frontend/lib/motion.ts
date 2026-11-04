// Rung ngang khi form lỗi. Web Animations API thay cho class CSS: gọi lại được mỗi lần lỗi
// mà không phải gỡ/gắn class hay đổi key (đổi key làm mất chữ người dùng đã nhập).
export function shake(el: HTMLElement | null) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [0, -8, 7, -5, 3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 450, easing: "ease-out" },
  );
}
