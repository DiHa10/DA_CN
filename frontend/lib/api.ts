export type Sentiment = "positive" | "neutral" | "negative";

export type Store = { id: number; name: string; slug: string };

export type Review = {
  id: number;
  source: string;
  author: string | null;
  content: string;
  rating: number | null;
  created_at: string;
  analysis: { sentiment: Sentiment; confidence: number } | null;
  aspects: { aspect: string; sentiment: Sentiment }[];
};

type Counts = Record<Sentiment, number>;
export type AspectRow = {
  aspect: string;
  total: number;
  latest_negative: { content: string; created_at: string } | null;
} & Counts;

export type Summary = {
  total: number;
  analyzed: number;
  sentiment: Counts;
  rated: number;
  avg_rating: number | null;
  trend: ({ week_start: string } & Counts)[];
  aspects: AspectRow[];
  improve: { aspect: string; negative_rate: number }[];
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
