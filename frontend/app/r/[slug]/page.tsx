"use client";

import { api, json } from "@/lib/api";
import { shake } from "@/lib/motion";
import { Check, Star } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const RATING_WORD = ["", "Rất tệ", "Chưa tốt", "Bình thường", "Tốt", "Rất tốt"];

export default function PublicReviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0); // rê chuột: xem trước số sao trước khi bấm
  const form = useRef<HTMLFormElement>(null);
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
      shake(form.current);
    }
    setSending(false);
  }

  return (
    <main className="on-dark min-h-screen">
      <div className="mx-auto max-w-md px-5 py-10 sm:py-16">
        {notFound ? (
          <p>Không tìm thấy cửa hàng. Bạn kiểm tra lại mã QR giúp quán nhé.</p>
        ) : !storeName ? (
          <p className="text-muted">Đang tải…</p>
        ) : done ? (
          <div>
            <span className="anim-rise mb-6 flex size-10 items-center justify-center rounded-full bg-gold">
              <Check aria-hidden className="draw size-5 text-navy" />
            </span>
            <h1 style={{ animationDelay: "300ms" }} className="anim-rise text-[34px] leading-[1.1] font-normal tracking-[0.05em] text-gold">Cảm ơn bạn đã góp ý</h1>
            <p style={{ animationDelay: "380ms" }} className="anim-rise mt-2 text-muted">{storeName} đã nhận được góp ý của bạn và sẽ đọc từng ý một.</p>
          </div>
        ) : (
          <form ref={form} onSubmit={submit}>
            <p className="text-[13px] font-medium tracking-[0.08em] text-muted uppercase">Góp ý cho</p>
            <h1 className="mt-2 text-[34px] leading-[1.1] font-normal tracking-[0.05em] text-gold sm:text-[46px]">{storeName}</h1>

            <fieldset className="mt-10">
              <legend className="label">Bạn thấy bữa ăn hôm nay thế nào?</legend>
              <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} onMouseEnter={() => setHover(n)} className="-ml-1.5 cursor-pointer rounded-md p-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                    <input type="radio" name="rating" value={n} className="sr-only" checked={rating === n} onChange={() => setRating(n)} />
                    <Star aria-hidden strokeWidth={1.5}
                      className={`size-9 transition-colors duration-150 ${n <= (hover || rating) ? "fill-star text-star" : "text-on-dark-muted"} ${n === rating ? "pop" : ""}`} />
                    <span className="sr-only">{n} sao, {RATING_WORD[n]}</span>
                  </label>
                ))}
                <span aria-hidden className="ml-2 text-sm text-muted">{RATING_WORD[hover || rating]}</span>
              </div>
            </fieldset>

            <div className="mt-6">
              <label htmlFor="content" className="label">Điều bạn thích hoặc muốn quán sửa</label>
              <textarea id="content" name="content" required minLength={2} maxLength={2000} rows={5}
                className="input h-auto py-2.5 text-[17px] leading-7" aria-describedby="content-hint" />
              <p id="content-hint" className="mt-1 text-xs text-muted">Món ăn, phục vụ, giá cả, không gian…</p>
            </div>
            <div className="mt-5">
              <label htmlFor="author" className="label">Tên của bạn <span className="font-normal text-muted">(không bắt buộc)</span></label>
              <input id="author" name="author" maxLength={200} autoComplete="name" className="input text-base" />
            </div>

            {error && <p role="alert" className="mt-4 text-sm text-gold">{error}</p>}
            <button disabled={sending} className="btn btn-gold btn-go mt-8 h-12 w-full text-[14px]">{sending ? "Đang gửi…" : "Gửi góp ý"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
