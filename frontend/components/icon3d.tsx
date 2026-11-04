import Image from "next/image";

// Icon 3D (3dicons.co, bản "premium" xanh đen + vàng, giấy phép CC0) cho các chỗ minh họa:
// trang giới thiệu, trạng thái trống. Không dùng ở menu/nút: ở cỡ nhỏ icon nét (lucide) rõ hơn và nhẹ hơn.
export type Icon3DName =
  | "bell" | "bulb" | "chart" | "chat-bubble" | "folder" | "heart" | "key"
  | "map-pin" | "mobile" | "pencil" | "rocket" | "shield" | "zoom";

export function Icon3D({ name, size = 64, className = "" }: { name: Icon3DName; size?: number; className?: string }) {
  return <Image src={`/icons3d/${name}.webp`} alt="" aria-hidden width={size} height={size} className={`select-none ${className}`} />;
}
