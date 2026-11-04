"use client";

import { Wordmark } from "@/components/mark";
import { api, json, type Sentiment } from "@/lib/api";
import { ASPECT_LABEL, SENTIMENT_LABEL, SENTIMENT_PILL } from "@/lib/labels";
import { animate, createDrawable, createScope, onScroll, splitText, stagger } from "animejs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/*
 * Trang giới thiệu công khai: kể đường đi của một lời góp ý, mỗi phần một màn hình, chuyển động theo thanh cuộn.
 * Nội dung luôn hiện đủ khi không có JavaScript hoặc người dùng bật "giảm chuyển động": anime.js chỉ được gọi
 * khi được phép, và mọi phần tử ở trạng thái cuối theo mặc định.
 */

const ASPECTS = ["food", "drink", "service", "price", "ambience", "location"] as const;
const SAMPLES = [
  "Phở ngon nhưng phục vụ chậm",
  "Cà phê thơm, giá hơi cao so với chất lượng",
  "Không gian yên tĩnh, rất hợp để ngồi học",
  "Chỗ để xe khó tìm, nhân viên thì dễ thương",
];
// từ được tô ở câu mẫu đầu tiên (phần 3 trước khi người xem tự thử)
const DEMO = { text: "Phở ngon nhưng phục vụ chậm", good: ["ngon"], bad: ["chậm"], aspects: { food: "positive", service: "negative" } };

const ROLES = [
  { name: "Chủ quán", can: ["Tạo, xóa cửa hàng và chi nhánh", "Thêm người, chia vai trò", "Bật email báo cáo mỗi sáng thứ Hai"], plus: "Làm được mọi việc của quản lý" },
  { name: "Quản lý", can: ["Nhập file đánh giá từ Google Maps", "Xuất Excel", "Cập nhật gợi ý AI", "Ẩn review nghi spam khỏi thống kê"], plus: "Làm được mọi việc của nhân viên" },
  { name: "Nhân viên", can: ["Xem tổng quan và từng đánh giá", "Trả lời khách, có AI soạn nháp"], plus: "" },
];

const STEPS = [
  { who: "Chủ quán", what: "Vào Cửa hàng, tải mã QR, in và dán lên bàn. Thêm quản lý và nhân viên bằng email." },
  { who: "Quản lý", what: "Vào Nhập dữ liệu, chọn file đánh giá Google Maps (CSV hoặc Excel). Hệ thống tự phân tích." },
  { who: "Nhân viên", what: "Mở Đánh giá, lọc Tiêu cực, trả lời từng khách. Bấm “Gợi ý bằng AI” nếu cần câu mở đầu." },
];

export default function IntroPage() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scope = createScope({ root }).add(() => {
      // 1. Mở đầu: ngoặc kép tự vẽ, tiêu đề rơi vào từng chữ
      animate(createDrawable("[data-hero-mark] path"), { draw: ["0 0", "0 1"], duration: 1200, ease: "inOutQuad" });
      const { chars } = splitText("[data-hero-title]", { chars: true });
      animate(chars, { y: ["0.6em", 0], opacity: [0, 1], delay: stagger(22, { start: 200 }), duration: 600, ease: "outExpo" });
      animate("[data-hero-sub]", { opacity: [0, 1], y: [12, 0], delay: 900, duration: 600, ease: "outQuad" });

      // 2. Thu thập: đường từ 3 nguồn vẽ dần về một mối theo thanh cuộn
      animate(createDrawable("[data-flow] path"), {
        draw: ["0 0", "0 1"], ease: "linear", delay: stagger(120),
        autoplay: onScroll({ target: "[data-section=collect]", enter: "85% start", leave: "40% end", sync: 0.4 }),
      });
      animate("[data-source]", {
        opacity: [0, 1], y: [24, 0], delay: stagger(100), duration: 600, ease: "outExpo",
        autoplay: onScroll({ target: "[data-section=collect]", enter: "80% start" }),
      });

      // 3. Phân tích: từng từ hiện ra, từ khen sáng xanh, từ chê sáng đỏ, rồi khía cạnh tương ứng bật lên
      animate("[data-demo-word]", {
        opacity: [0.15, 1], y: [10, 0], delay: stagger(70), duration: 400, ease: "outQuad",
        autoplay: onScroll({ target: "[data-section=analyze]", enter: "75% start" }),
      });
      animate("[data-demo-chip=on]", {
        scale: [0.8, 1], opacity: [0.3, 1], delay: stagger(150, { start: 700 }), duration: 500, ease: "outBack(2)",
        autoplay: onScroll({ target: "[data-section=analyze]", enter: "75% start" }),
      });

      // 4. Tổng hợp: thanh dài ra theo cuộn, con số chạy tới giá trị thật
      animate("[data-bar]", {
        scaleX: [0, 1], delay: stagger(80), ease: "outQuad",
        autoplay: onScroll({ target: "[data-section=summary]", enter: "85% start", leave: "45% end", sync: 0.5 }),
      });
      document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const to = Number(el.dataset.count);
        const n = { v: 0 };
        animate(n, {
          v: to, duration: 1200, ease: "outExpo", modifier: Math.round,
          onUpdate: () => { el.textContent = n.v.toLocaleString("vi-VN"); },
          autoplay: onScroll({ target: el, enter: "90% start" }),
        });
      });

      // 5. Cảnh báo: đường biểu đồ tự vẽ, vẽ tới tuần cuối thì điểm vọt lên mới nảy ra
      animate(createDrawable("[data-trend] path"), {
        draw: ["0 0", "0 1"], duration: 1400, ease: "inOutSine",
        autoplay: onScroll({ target: "[data-trend]", enter: "85% start" }),
      });
      animate("[data-spike]", {
        scale: [0, 1], delay: 1300, duration: 700, ease: "outElastic(1, .5)",
        autoplay: onScroll({ target: "[data-trend]", enter: "85% start" }),
      });
      const ai = splitText("[data-ai-text]", { words: true });
      animate(ai.words, {
        opacity: [0, 1], delay: stagger(45), duration: 200,
        autoplay: onScroll({ target: "[data-ai-text]", enter: "85% start" }),
      });

      // 6. Spam: ba thẻ giống hệt xòe ra, dấu "Nghi spam" đóng xuống
      animate("[data-dup]", {
        rotate: stagger([-4, 4]), x: stagger([-18, 18]), // 3 thẻ: -4°, 0°, 4°
        duration: 700, ease: "outExpo",
        autoplay: onScroll({ target: "[data-section=spam]", enter: "70% start" }),
      });
      animate("[data-stamp]", {
        scale: [2.2, 1], opacity: [0, 1], rotate: [-18, -8], delay: 500, duration: 450, ease: "outQuad",
        autoplay: onScroll({ target: "[data-section=spam]", enter: "70% start" }),
      });

      // 7, 8. Vai trò và bước đầu: lần lượt trồi lên
      ["roles", "start"].forEach((s) => animate(`[data-section=${s}] [data-rise]`, {
        opacity: [0, 1], y: [28, 0], delay: stagger(110), duration: 700, ease: "outExpo",
        autoplay: onScroll({ target: `[data-section=${s}]`, enter: "80% start" }),
      }));
    });
    return () => { scope.revert(); };
  }, []);

  return (
    <div ref={root} className="overflow-x-clip">
      <header className="on-dark sticky top-0 z-20 flex h-14 items-center justify-between px-5 md:px-10">
        <Link href="/gioi-thieu"><Wordmark /></Link>
        <Link href="/dashboard" className="btn btn-gold btn-go">Vào ứng dụng</Link>
      </header>

      {/* 1. Mở đầu */}
      <section className="on-dark flex min-h-[calc(100svh-56px)] flex-col justify-center px-5 pb-16 md:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <svg data-hero-mark viewBox="0 0 20 20" aria-hidden className="mb-8 size-14 md:size-20">
            <path fill="none" stroke="var(--gold)" strokeWidth="0.8" d="M2 11.5C2 7.4 4.3 4.6 8 3.5l.8 1.6C6.6 6 5.5 7.6 5.4 9.6H8.5V16H2v-4.5Zm9.5 0c0-4.1 2.3-6.9 6-8l.8 1.6c-2.2.9-3.3 2.5-3.4 4.5H18V16h-6.5v-4.5Z" />
          </svg>
          <p className="text-[13px] font-semibold tracking-[0.1em] text-on-dark-muted uppercase">Cách Quán Nghe hoạt động</p>
          <h1 data-hero-title className="mt-4 max-w-4xl text-[44px] leading-[1.05] font-normal tracking-[0.04em] text-gold md:text-[76px]">
            Mỗi lời khách nói đều được nghe
          </h1>
          <p data-hero-sub className="mt-6 max-w-xl text-[17px] leading-[1.5] md:text-[19px]">
            Quán Nghe gom góp ý từ Google Maps và mã QR tại bàn, đọc từng câu, rồi cho bạn biết khách đang khen gì, chê gì và nên sửa gì trước.
            Kéo xuống để xem một lời góp ý đi qua hệ thống thế nào.
          </p>
        </div>
      </section>

      {/* 2. Thu thập */}
      <Section id="collect" step="1" title="Góp ý đến từ ba nơi" intro="Bạn không phải chép tay. Mọi nguồn đổ về một chỗ.">
        <div className="relative grid gap-4 md:grid-cols-3">
          {[
            ["Google Maps", "Tải đánh giá của quán về thành file, rồi nhập vào. Review đã có thì tự bỏ qua, không bị trùng."],
            ["Mã QR tại bàn", "Khách quét mã, chấm sao, viết vài dòng. Không cần cài app hay đăng nhập."],
            ["Nhập tay", "Góp ý nghe trực tiếp ở quầy, hoặc file Excel có sẵn của quán."],
          ].map(([t, d]) => (
            <div key={t} data-source className="panel p-5">
              <h3 className="heading">{t}</h3>
              <p className="mt-2 text-muted">{d}</p>
            </div>
          ))}
        </div>
        <svg data-flow viewBox="0 0 600 120" aria-hidden className="mx-auto mt-2 hidden h-28 w-full max-w-3xl md:block" fill="none" stroke="var(--blue)" strokeWidth="1.5">
          <path d="M100 0 C100 70, 300 50, 300 112" />
          <path d="M300 0 L300 112" />
          <path d="M500 0 C500 70, 300 50, 300 112" />
        </svg>
        <p className="mx-auto mt-4 w-fit rounded-sm bg-navy px-4 py-2 text-[13px] font-semibold tracking-[0.08em] text-cream uppercase md:mt-0">
          Một danh sách đánh giá chung
        </p>
      </Section>

      {/* 3. Phân tích + thử trực tiếp */}
      <Section id="analyze" step="2" title="Máy đọc từng câu, tách theo 6 khía cạnh" dark
        intro="Một câu khách viết thường nói nhiều chuyện cùng lúc. Hệ thống không chỉ chấm cả câu khen hay chê, mà xem từng chuyện: món ăn, phục vụ, giá… được khen hay bị chê.">
        <p className="text-[26px] leading-snug tracking-[0.02em] md:text-[38px]">
          “{DEMO.text.split(" ").map((w, i) => (
            <span key={i} data-demo-word className={DEMO.good.includes(w) ? "text-[#7fd6a0]" : DEMO.bad.includes(w) ? "text-[#ff9b8f]" : ""}>
              {w}{" "}
            </span>
          ))}”
        </p>
        <AspectChips aspects={DEMO.aspects} />
        <LiveTry />
      </Section>

      {/* 4. Tổng hợp */}
      <Section id="summary" step="3" title="Hàng trăm góp ý thành một bảng" intro="Mỗi khía cạnh một thanh: đỏ là chê, xám là trung lập, xanh là khen. Khía cạnh bị chê nhiều nhất nằm trên cùng, để biết sửa gì trước.">
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <div className="grid grid-cols-3 gap-4 lg:grid-cols-1">
            {[["Đánh giá", 300], ["Khen", 174], ["Chê", 101]].map(([l, v]) => (
              <div key={l} className="panel p-4">
                <p className="text-sm text-muted">{l}</p>
                <p data-count={v} className="num text-[30px] leading-9">{v}</p>
              </div>
            ))}
          </div>
          <div className="panel space-y-4 p-5">
            {[["service", 54, 4, 42], ["location", 43, 0, 57], ["price", 43, 2, 55], ["food", 11, 10, 79]].map(([a, neg, neu, pos]) => (
              <div key={a} className="grid grid-cols-[96px_1fr_44px] items-center gap-3">
                <span className="font-medium">{ASPECT_LABEL[a as string]}</span>
                <div data-bar className="flex h-2.5 origin-left gap-0.5 overflow-hidden rounded-sm">
                  <span style={{ flexGrow: neg as number }} className="bg-negative" />
                  <span style={{ flexGrow: neu as number }} className="bg-[#c3c9d4]" />
                  <span style={{ flexGrow: pos as number }} className="bg-positive" />
                </div>
                <span className="num text-right font-medium text-negative">{neg}%</span>
              </div>
            ))}
            <p className="text-xs text-muted">Số liệu minh họa từ quán demo.</p>
          </div>
        </div>
      </Section>

      {/* 5. Cảnh báo + gợi ý AI */}
      <Section id="alert" step="4" title="Chê tăng vọt thì báo ngay, AI gợi ý việc nên làm" dark
        intro="Hệ thống so tỉ lệ chê 7 ngày qua với 8 tuần trước. Tăng rõ rệt, không phải ngẫu nhiên, thì hiện cảnh báo ở đầu trang Tổng quan và trong email sáng thứ Hai.">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <svg data-trend viewBox="0 0 400 170" aria-label="Tỉ lệ chê phục vụ theo tuần: ổn định khoảng 18%, tuần này vọt lên 64%" role="img" className="w-full">
            <line x1="0" y1="150" x2="400" y2="150" stroke="#22324f" />
            <path fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinejoin="round"
              d="M10 128 L55 122 L100 130 L145 118 L190 126 L235 120 L280 124 L325 116 L380 40" />
            <circle data-spike cx="380" cy="40" r="7" fill="var(--negative)" />
            <text x="300" y="30" fill="var(--cream)" fontSize="13">64% bị chê</text>
            <text x="10" y="110" fill="var(--on-dark-muted)" fontSize="12">thường khoảng 18%</text>
          </svg>
          <div className="space-y-4">
            <div className="rounded-lg border border-[#22324f] p-4">
              <p className="text-[12px] font-semibold tracking-[0.08em] text-gold uppercase">Bất thường trong 7 ngày qua</p>
              <p className="mt-1">Phục vụ bị chê 64% lượt nhắc (9/14), thường chỉ 18%.</p>
            </div>
            <div className="on-light rounded-lg bg-surface p-4 text-ink">
              <p className="heading">Gợi ý cải thiện · Phục vụ</p>
              <p data-ai-text className="mt-2">
                Khách phàn nàn chờ món lâu vào giờ trưa. Nên thêm một người chạy bàn từ 11 giờ đến 13 giờ, và báo trước thời gian chờ khi quán đông.
              </p>
              <p className="mt-2 text-xs text-muted">AI chạy ngay trên máy của quán, đánh giá của khách không gửi ra ngoài.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. Spam */}
      <Section id="spam" step="5" title="Review đáng ngờ được gắn cờ" intro="Một nội dung đăng lại nhiều lần, một máy gửi dồn dập qua mã QR, nội dung vô nghĩa, số sao ngược với lời viết: hệ thống gắn cờ “Nghi spam”. Quản lý xem lại rồi quyết định có ẩn khỏi thống kê hay không, máy không tự xóa lời của khách.">
        <div className="relative mx-auto h-44 max-w-md">
          {[0, 1, 2].map((i) => (
            <div key={i} data-dup className="panel absolute inset-x-0 top-6 p-4" style={{ zIndex: i }}>
              <p className="hand">Quán dở tệ, phục vụ thái độ khó chịu, không bao giờ quay lại</p>
              <p className="mt-1 text-xs text-muted">Qua mã QR · 1★ · cách nhau vài giây</p>
            </div>
          ))}
          <span data-stamp className="absolute -top-1 right-2 z-10 rotate-[-8deg] rounded-sm border-2 border-negative px-3 py-1 text-sm font-bold tracking-[0.08em] text-negative uppercase">
            Nghi spam
          </span>
        </div>
      </Section>

      {/* 7. Vai trò */}
      <Section id="roles" step="6" title="Ai làm được gì" dark intro="Mỗi người được thêm vào quán với một vai trò. Ai cũng xem được số liệu, việc thay đổi dữ liệu thì tùy vai trò.">
        <div className="grid gap-4 md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.name} data-rise className="rounded-lg border border-[#22324f] p-5">
              <h3 className="text-[22px] font-medium tracking-[0.04em] text-gold">{r.name}</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                {r.can.map((c) => <li key={c}>{c}</li>)}
              </ul>
              {r.plus && <p className="mt-3 text-sm text-on-dark-muted">{r.plus}.</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* 8. Bắt đầu */}
      <Section id="start" step="7" title="Bắt đầu trong 5 phút" intro="Việc đầu tiên cho từng vai trò.">
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.who} data-rise className="panel p-5">
              <p className="num text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">Bước {i + 1} · {s.who}</p>
              <p className="mt-2">{s.what}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn btn-primary btn-go">Vào Tổng quan</Link>
          <Link href="/login" className="btn">Đăng nhập</Link>
        </div>
      </Section>

      <footer className="on-dark px-5 py-10 text-sm md:px-10">
        <div className="mx-auto max-w-5xl space-y-1 text-on-dark-muted">
          <p>Phía sau: mô hình PhoBERT (VinAI) huấn luyện thêm trên bộ đánh giá nhà hàng VLSP 2018 để tách cảm xúc theo khía cạnh; Qwen2.5 3B chạy trên máy để viết gợi ý.</p>
          <p>Đồ án chuyên ngành · Hệ thống tự động đánh giá và phân tích phản hồi của khách hàng.</p>
        </div>
      </footer>
    </div>
  );
}

function Section({ id, step, title, intro, dark, children }: {
  id: string; step: string; title: string; intro: string; dark?: boolean; children: React.ReactNode;
}) {
  return (
    <section data-section={id} className={`px-5 py-20 md:px-10 md:py-28 ${dark ? "on-dark" : "bg-ground"}`}>
      <div className="mx-auto max-w-5xl">
        <p className={`num text-[13px] font-semibold tracking-[0.1em] uppercase ${dark ? "text-gold" : "text-blue"}`}>{step.padStart(2, "0")}</p>
        <h2 className={`mt-2 max-w-3xl text-[30px] leading-[1.15] font-medium tracking-[0.03em] md:text-[44px] ${dark ? "text-cream" : "text-blue"}`}>{title}</h2>
        <p className={`mt-4 mb-10 max-w-2xl text-[17px] leading-[1.55] ${dark ? "text-on-dark-muted" : "text-muted"}`}>{intro}</p>
        {children}
      </div>
    </section>
  );
}

// 6 khía cạnh; khía cạnh được nhắc thì bật màu khen/chê, còn lại mờ
function AspectChips({ aspects, live }: { aspects: Record<string, string>; live?: boolean }) {
  return (
    <ul className="mt-8 flex flex-wrap gap-2" aria-label="Kết quả theo khía cạnh">
      {ASPECTS.map((a) => {
        const s = aspects[a] as Sentiment | undefined;
        return (
          <li key={a} data-demo-chip={s ? "on" : "off"} data-live-chip={live && s ? "" : undefined}
            className={`rounded-sm px-3 py-1.5 text-sm font-medium ${s ? SENTIMENT_PILL[s] : "border border-[#22324f] text-on-dark-muted"}`}>
            {ASPECT_LABEL[a]}{s && <>: {SENTIMENT_LABEL[s].toLowerCase()}</>}
          </li>
        );
      })}
    </ul>
  );
}

// Thử trực tiếp: gõ câu của mình, PhoBERT trên máy chủ tách khía cạnh thật (không lưu câu)
function LiveTry() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ sentiment: Sentiment; aspects: Record<string, string>; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const out = useRef<HTMLDivElement>(null);

  async function run(t: string) {
    if (t.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ sentiment: Sentiment; aspects: Record<string, string> }>("/public/analyze", json("POST", { text: t }));
      setResult({ ...r, text: t });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  // kết quả mới: khía cạnh được nhắc bật lên lần lượt
  useEffect(() => {
    if (!result || !out.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = animate(out.current.querySelectorAll("[data-live-chip], [data-live-overall]"), {
      scale: [0.7, 1], opacity: [0, 1], delay: stagger(110), duration: 450, ease: "outBack(2)",
    });
    return () => { a.revert(); };
  }, [result]);

  return (
    <div className="mt-14 rounded-lg border border-[#22324f] p-5 md:p-7">
      <h3 className="text-[13px] font-semibold tracking-[0.1em] text-gold uppercase">Thử với câu của bạn</h3>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(text); }}>
        <label htmlFor="try" className="sr-only">Câu góp ý để phân tích</label>
        <input id="try" className="input flex-1" maxLength={300} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ví dụ: Bún bò đậm vị nhưng chờ hơi lâu" />
        <button className="btn btn-gold btn-go" disabled={busy || text.trim().length < 2}>{busy ? "Đang đọc…" : "Phân tích"}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-on-dark-muted">Hoặc chọn:</span>
        {SAMPLES.map((s) => (
          <button key={s} type="button" className="tap cursor-pointer text-cream underline decoration-[#22324f] underline-offset-4 hover:decoration-gold"
            onClick={() => { setText(s); run(s); }}>
            {s}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 text-gold">{error}</p>}
      <div ref={out} aria-live="polite">
        {result && (
          <div className="mt-6">
            <p className="text-on-dark-muted">“{result.text}”</p>
            <p data-live-overall className="mt-3">
              Cả câu: <span className={`rounded-sm px-2 py-0.5 text-sm font-medium ${SENTIMENT_PILL[result.sentiment]}`}>{SENTIMENT_LABEL[result.sentiment]}</span>
            </p>
            {Object.keys(result.aspects).length === 0
              ? <p className="mt-3 text-on-dark-muted">Câu này không nhắc tới khía cạnh nào trong 6 khía cạnh.</p>
              : <AspectChips aspects={result.aspects} live />}
          </div>
        )}
      </div>
    </div>
  );
}
