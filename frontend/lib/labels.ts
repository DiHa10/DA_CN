import type { Sentiment } from "./api";

export const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Tích cực",
  neutral: "Trung lập",
  negative: "Tiêu cực",
};

// màu dữ liệu: khen xanh, chê đỏ, trung lập xám (SVG của Recharts cần mã màu, không nhận CSS var)
export const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: "#2e7d4f",
  neutral: "#b8becc",
  negative: "#c8323c",
};

// cặp nền nhạt + chữ đậm cùng tông cho pill
export const SENTIMENT_PILL: Record<Sentiment, string> = {
  positive: "bg-[#dcfae5] text-[#04250e]",
  neutral: "bg-[#ebedee] text-[#353736]",
  negative: "bg-[#ffedea] text-[#831c1e]",
};

export const ACCENT = "#2c4ba0";

export const ASPECT_LABEL: Record<string, string> = {
  food: "Món ăn",
  drink: "Đồ uống",
  service: "Phục vụ",
  price: "Giá cả",
  ambience: "Không gian",
  location: "Vị trí",
};

export const SOURCE_LABEL: Record<string, string> = {
  google: "Google Maps",
  qr: "QR tại quán",
  csv: "Import file",
  manual: "Nhập tay",
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

// số thập phân kiểu Việt Nam: 57,9
export const formatNum = (n: number, digits = 1) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatPct = (n: number, total: number) => (total ? `${formatNum((n / total) * 100)}%` : "—");

export const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ quán",
  manager: "Quản lý",
  staff: "Nhân viên",
};

export const SPAM_LABEL: Record<string, string> = {
  duplicate: "Trùng lặp",
  burst: "Gửi dồn dập",
  gibberish: "Nội dung vô nghĩa",
  rating_mismatch: "Số sao ngược nội dung",
};
