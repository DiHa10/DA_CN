import type { Sentiment } from "./api";

export const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative"];

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Tích cực",
  neutral: "Trung lập",
  negative: "Tiêu cực",
};

// màu dữ liệu: khen xanh dương, chê đỏ, trung lập xám (biểu đồ cần mã màu, không nhận CSS var).
// Khen là xanh dương chứ không xanh lá: đỏ/xanh lá gần như trùng nhau với người mù màu đỏ-lục
// (ΔE 3,6 theo kiểm tra của skill dataviz; đỏ/xanh dương 22,4). Xanh lá chỉ còn cho trạng thái "tốt" (đã xử lý, giảm rõ).
export const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: "#2f70bb",
  neutral: "#c9cbcd",
  negative: "#b3362b",
};
// màu nhận diện (quán, nguồn): bảng phân loại của skill dataviz, gán theo thứ tự cố định, không xoay vòng
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
// nguồn đánh giá: tránh xanh dương (= khen) và cam đỏ (= chê) để không đọc nhầm nghĩa; đã qua kiểm tra mù màu
export const SOURCE_COLOR: Record<string, string> = { google: "#6250d6", qr: "#1baf7a", csv: "#eda100", manual: "#e87ba4" };
export const STAR_COLOR = "#a8740f"; // vàng sẫm: 3,5:1 trên nền trắng (vàng đồng của sao chỉ 1,9:1)

// cặp nền nhạt + chữ đậm cùng tông cho pill
export const SENTIMENT_PILL: Record<Sentiment, string> = {
  positive: "bg-[#e3edf9] text-[#163a66]",
  neutral: "bg-[#e6e9ef] text-[#2b3140]",
  negative: "bg-[#f6e0da] text-[#7a1f17]",
};

export const ACCENT = "#1b6c80";

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

export const STATUS_LABEL: Record<string, string> = {
  doing: "Đang xử lý",
  done: "Đã xử lý",
};

export const SPAM_LABEL: Record<string, string> = {
  duplicate: "Trùng lặp",
  burst: "Gửi dồn dập",
  gibberish: "Nội dung vô nghĩa",
  rating_mismatch: "Số sao ngược nội dung",
};
