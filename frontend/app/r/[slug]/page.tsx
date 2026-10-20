"use client";

import { api, json } from "@/lib/api";
import { Check, Star } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const RATING_WORD = ["", "Rất tệ", "Chưa tốt", "Bình thường", "Tốt", "Rất tốt"];

export default function PublicReviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rating, setRating] = useState(0);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<{ name: string }>(`/public/stores/${slug}`).then((s) => setStoreName(s.name), () => setNotFound(true));
  }, [slug]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSending(true);
    setError("");
    try {
      await api(`/public/stores/${slug}/reviews`, json("POST", {
        content: f.get("content"),
        author: f.get("author") || null,
        rating: rating || null,
      }));
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
    setSending(false);
  }

  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto max-w-md px-5 py-10 sm:py-16">
        {notFound ? (
          <p>Không tìm thấy cửa hàng. Bạn kiểm tra lại mã QR giúp quán nhé.</p>
        ) : !storeName ? (
          <p className="text-muted">Đang tải…</p>
        ) : done ? (
          <div>
            <span className="mb-5 flex size-10 items-center justify-center rounded-full bg-[#dcfae5]">
              <Check aria-hidden className="size-5 text-positive" />
            </span>
            <h1 className="text-2xl font-semibold">Cảm ơn bạn đã góp ý</h1>
            <p className="mt-2 text-muted">{storeName} đã nhận được góp ý của bạn và sẽ đọc từng ý một.</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="text-sm text-muted">Góp ý cho</p>
            <h1 className="text-2xl leading-8 font-semibold">{storeName}</h1>

            <fieldset className="mt-8">
              <legend className="label">Bạn thấy bữa ăn hôm nay thế nào?</legend>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="-ml-1.5 cursor-pointer rounded-md p-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                    <input type="radio" name="rating" value={n} className="sr-only" checked={rating === n} onChange={() => setRating(n)} />
                    <Star aria-hidden strokeWidth={1.5}
                      className={`size-9 transition-colors duration-150 ${n <= rating ? "fill-star text-star" : "text-control"}`} />
                    <span className="sr-only">{n} sao, {RATING_WORD[n]}</span>
                  </label>
                ))}
                <span aria-hidden className="ml-2 text-sm text-muted">{RATING_WORD[rating]}</span>
              </div>
            </fieldset>

            <div className="mt-6">
              <label htmlFor="content" className="label">Điều bạn thích hoặc muốn quán sửa</label>
              <textarea id="content" name="content" required minLength={2} maxLength={2000} rows={5}
                className="input h-auto py-2.5 text-base" aria-describedby="content-hint" />
              <p id="content-hint" className="mt-1 text-xs text-muted">Món ăn, phục vụ, giá cả, không gian…</p>
            </div>
            <div className="mt-5">
              <label htmlFor="author" className="label">Tên của bạn <span className="font-normal text-muted">(không bắt buộc)</span></label>
              <input id="author" name="author" maxLength={200} autoComplete="name" className="input text-base" />
            </div>

            {error && <p role="alert" className="mt-4 text-sm text-negative">{error}</p>}
            <button disabled={sending} className="btn btn-primary mt-6 h-12 w-full text-base">{sending ? "Đang gửi…" : "Gửi góp ý"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
