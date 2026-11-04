// Khung xương lúc đang tải: thấy trước bố cục thay cho chữ "Đang tải…". Trình đọc màn hình vẫn đọc "Đang tải".
export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div role="status" className={`space-y-3 ${className}`}>
      <span className="sr-only">Đang tải…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} aria-hidden className="skeleton h-4" style={{ width: `${[92, 78, 85, 64, 88][i % 5]}%` }} />
      ))}
    </div>
  );
}
