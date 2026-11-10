export type Sentiment = "positive" | "neutral" | "negative";

export type Role = "owner" | "manager" | "staff";

export type Store = {
  id: number;
  name: string;
  slug: string;
  report_email: string | null;
  weekly_report: boolean;
  role: Role; // vai trò của người đang xem ở quán này
};

const RANK: Record<Role, number> = { staff: 1, manager: 2, owner: 3 };
// ẩn nút không được dùng; backend vẫn tự chặn bằng 403
export const can = (store: Store | null, min: Role) => !!store && RANK[store.role] >= RANK[min];

export type Member = { user_id: number; email: string; role: Role };

type Rate = { mentions: number; negative_rate: number | null };
export type Compare = {
  days: number;
  stores: ({ id: number; name: string; aspects: Record<string, Rate> } & Rate)[];
  overall: { aspects: Record<string, Rate> } & Rate;
};

export type Anomalies = {
  since: string;
  alerts: { aspect: string | null; mentions: number; negative: number; rate: number; baseline_rate: number; z: number }[];
};

export type Review = {
  id: number;
  source: string;
  author: string | null;
  content: string;
  rating: number | null;
  created_at: string;
  reply_text: string | null;
  replied_at: string | null;
  spam_reasons: string[] | null;
  hidden: boolean;
  status: "doing" | "done" | null; // null = lời chê chưa xử lý
  status_note: string | null;
  analysis: { sentiment: Sentiment; confidence: number } | null;
  aspects: { aspect: string; sentiment: Sentiment; corrected: boolean }[];
};

type Counts = Record<Sentiment, number>;
export type AspectRow = {
  aspect: string;
  total: number;
  latest_negative: { content: string; created_at: string } | null;
} & Counts;

export type Summary = {
  since: string | null;
  total: number;
  analyzed: number;
  sentiment: Counts;
  rated: number;
  avg_rating: number | null;
  trend: ({ week_start: string; rated: number; avg_rating: number | null } & Counts)[];
  aspects: AspectRow[];
  complaints: { phrase: string; count: number }[];
  open_complaints: number;
  rating_dist: number[]; // số lượt 1★..5★
  // cùng độ dài ngay trước khoảng đang xem; null khi xem toàn bộ lịch sử
  previous: { total: number; analyzed: number; sentiment: Counts; avg_rating: number | null } | null;
  // chỉ góp ý qua QR: cells[khung giờ][thứ 0 = thứ Hai]
  by_time: { total: number; slots: string[]; cells: { total: number; negative: number }[][] };
};

type Side = { mentions: number; negative: number };
export type Action = {
  id: number;
  day: string;
  aspect: string | null; // null = tổng thể
  note: string;
  before: Side;
  after: Side;
  after_days: number;
  enough: boolean;
  verdict: "better" | "worse" | "same" | null;
};

export type Insight = {
  generated_at: string;
  content: {
    headline: string;
    window_days: number | null;
    negative_reviews: number;
    aspects: { aspect: string; problem: string; actions: string[]; mentions: number }[];
  };
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/backend${path}`, init);
  if (res.status === 401 && !path.startsWith("/public")) {
    window.location.href = "/login";
    throw new Error("Phiên đăng nhập đã hết hạn");
  }
  if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => ({})), res.status));
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function errorMessage(body: { detail?: unknown }, status: number): string {
  const d = body.detail;
  if (typeof d === "string") return d;
  // lỗi validate của FastAPI: [{loc, msg}, ...]
  if (Array.isArray(d) && d[0]?.msg) return `${d[0].loc?.at(-1) ?? ""}: ${d[0].msg}`;
  return `Lỗi ${status}`;
}

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
