"use client";

import { useRef, useState } from "react";

const HOLD_MS = 1200;

// Thao tác không hoàn tác được (xóa cửa hàng): phải nhấn giữ, thanh chạy đầy mới thực hiện; thả sớm là hủy.
// Bàn phím và trình đọc màn hình không "giữ" được nên nhận hộp xác nhận như cũ (click có detail = 0).
export function HoldButton({ children, confirmText, onConfirm }: {
  children: React.ReactNode; confirmText: string; onConfirm: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const start = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setHolding(true);
    timer.current = setTimeout(() => { setHolding(false); onConfirm(); }, HOLD_MS);
  };
  const cancel = () => { clearTimeout(timer.current); setHolding(false); };

  return (
    <button type="button" className={`hold ${holding ? "holding" : ""}`} style={{ "--hold": `${HOLD_MS}ms` } as React.CSSProperties}
      onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => { if (e.detail === 0 && confirm(confirmText)) onConfirm(); }}>
      {children}
    </button>
  );
}
