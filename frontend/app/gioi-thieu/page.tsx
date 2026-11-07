"use client";

import { Icon3D } from "@/components/icon3d";
import { Wordmark } from "@/components/mark";
import { api, json, type Sentiment } from "@/lib/api";
import { ASPECT_LABEL, SENTIMENT_LABEL, SENTIMENT_PILL } from "@/lib/labels";
import { animate, createDrawable, createMotionPath, createTimeline, stagger, utils } from "animejs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/*
 * Trang giới thiệu công khai: kể đường đi của một lời góp ý, cùng giao diện sáng với ứng dụng.
 * Chuyển động: mỗi cảnh chạy MỘT lần khi nó thật sự vào màn hình (IntersectionObserver, tự theo khi trang đổi chiều cao),
 * không ghim, không tua theo từng nhịp cuộn, nên cuộn nhẹ và không có cảnh nào chạy trước khi lướt tới.
 * Phần tử của cảnh được CSS ẩn sẵn từ HTML (.reveal-ready, xem globals.css). Không JS hoặc "giảm chuyển động": hiện sẵn hết.
 */

type Els = Element[];
type Anim = { revert: () => unknown };

const ASPECTS = ["food", "drink", "service", "price", "ambience", "location"] as const;
const SAMPLES = [
  "Phở ngon nhưng phục vụ chậm",
  "Cà phê thơm, giá hơi cao so với chất lượng",
  "Không gian yên tĩnh, rất hợp để ngồi học",
  "Chỗ để xe khó tìm, nhân viên thì dễ thương",
];
// câu mẫu ở mở đầu: từ khen/chê và khía cạnh nó bay tới
const DEMO = { text: "Phở ngon nhưng phục vụ chậm", good: "ngon", bad: "chậm", aspects: { food: "positive", service: "negative" } };

// cảnh tổng hợp: mỗi khía cạnh một hàng ô, tỉ lệ chê | trung lập | khen (số minh họa)
const SUMMARY: [string, number, number][] = [["service", 54, 4], ["location", 43, 0], ["price", 43, 2], ["food", 11, 10]];
const TALLY: [string, number][] = [["Đánh giá", 300], ["Khen", 174], ["Chê", 101]];
const COLS = 40;
const cellColor = (neg: number, neu: number, c: number) =>
  c < (neg * COLS) / 100 ? "bg-negative" : c < ((neg + neu) * COLS) / 100 ? "bg-[#c9cbcd]" : "bg-positive";

const PARTICLES = 12; // hạt trên mỗi đường ở cảnh thu thập

// cảnh PhoBERT: số thật của model đang chạy (ml/models/absa) với câu DEMO, xác suất 4 nhãn cho mỗi khía cạnh
// theo thứ tự [không nhắc, khen, trung lập, chê]
const TOKENS = ["<s>", "phở", "ngon", "nhưng", "phục_vụ", "chậm", "</s>"];
const HEADS: [string, number[]][] = [
  ["food", [0.082, 0.697, 0.192, 0.029]],
  ["drink", [0.913, 0.027, 0.018, 0.042]],
  ["service", [0.007, 0.005, 0.011, 0.976]],
  ["price", [0.751, 0.127, 0.081, 0.042]],
  ["ambience", [0.816, 0.087, 0.022, 0.075]],
  ["location", [0.854, 0.043, 0.071, 0.032]],
];
const HEAD_LABEL = ["Không nhắc", "Khen", "Trung lập", "Chê"];
// thanh xếp chồng theo thứ tự đọc chê | trung lập | khen | không nhắc, như bảng khía cạnh trong ứng dụng
const HEAD_ORDER = [3, 2, 1, 0];
const HEAD_COLOR = ["#ebeae6", "#2f7a3e", "#c9cbcd", "#b3362b"];
// 32 ô đại diện cho 768 số của vector [CLS]; độ đậm cố định để server và trình duyệt vẽ giống nhau
const CLS_CELLS = Array.from({ length: 32 }, (_, i) => 0.15 + 0.85 * Math.abs(Math.sin(i * 2.3 + 0.7)));
const CUE_HIT: Record<string, string> = { food: "“phở”, “ngon”", service: "“phục vụ”, “chậm”" };

const SOURCES = [
  ["Google Maps", "Tải đánh giá của quán về thành file rồi nhập vào. Review đã có thì tự bỏ qua.", "map-pin"],
  ["Mã QR tại bàn", "Khách quét mã, chấm sao, viết vài dòng. Không cần cài app.", "mobile"],
  ["Nhập tay", "Góp ý nghe ở quầy, hoặc file Excel có sẵn của quán.", "pencil"],
] as const;

const ROLES = [
  { name: "Chủ quán", can: ["Tạo, xóa cửa hàng và chi nhánh", "Thêm người, chia vai trò", "Bật email báo cáo mỗi sáng thứ Hai"], plus: "Làm được mọi việc của quản lý" },
  { name: "Quản lý", can: ["Nhập file đánh giá từ Google Maps", "Xuất Excel", "Cập nhật gợi ý AI", "Ẩn review nghi spam khỏi thống kê"], plus: "Làm được mọi việc của nhân viên" },
  { name: "Nhân viên", can: ["Xem tổng quan và từng đánh giá", "Trả lời khách, có AI soạn nháp", "Đánh dấu lời chê đã xử lý"], plus: "" },
];

const STEPS = [
  { who: "Chủ quán", what: "Vào Cửa hàng, tải mã QR, in và dán lên bàn. Thêm quản lý và nhân viên bằng email." },
  { who: "Quản lý", what: "Vào Nhập dữ liệu, chọn file đánh giá Google Maps (CSV hoặc Excel). Hệ thống tự phân tích." },
  { who: "Nhân viên", what: "Mở Đánh giá, lọc lời chê chưa xử lý, trả lời từng khách. Bấm “Gợi ý bằng AI” nếu cần câu mở đầu." },
];

const CHAPTERS = [["collect", "Thu thập"], ["model", "PhoBERT"], ["analyze", "Thử"], ["summary", "Tổng hợp"], ["alert", "Cảnh báo"], ["spam", "Spam"], ["roles", "Vai trò"], ["start", "Bắt đầu"]];

const LIGHT_GOOD = "#7fd6a0";
const LIGHT_BAD = "#ff9b8f";

/* ---------- các cảnh: mỗi hàm chạy một lần, trả về các animation để gỡ khi rời trang ---------- */

function heroScene(root: Element): Anim[] {
  const q = (s: string): Els => [...root.querySelectorAll(s)];
  const word = (w: string) => root.querySelector(`[data-word="${w}"]`)!;
  // chip bay ra từ đúng chữ khen/chê: tính độ lệch giữa tâm chữ và tâm chip
  const offset = (w: string, chip: string) => {
    const a = word(w).getBoundingClientRect();
    const b = root.querySelector(`[data-chip="${chip}"]`)!.getBoundingClientRect();
    return { x: a.left + a.width / 2 - (b.left + b.width / 2), y: a.top + a.height / 2 - (b.top + b.height / 2) };
  };
  const fly = (o: { x: number; y: number }) => ({ x: [o.x, 0], y: [o.y, 0], scale: [0.3, 1], opacity: [0, 1], duration: 650, ease: "outBack(1.3)" });
  const others = q("[data-chip]").filter((c) => !["food", "service"].includes((c as HTMLElement).dataset.chip!));
  return [createTimeline({ delay: 300, defaults: { ease: "outQuad" } })
    .set(q("[data-chip]"), { opacity: 0 }, 0)
    .set([word(DEMO.good), word(DEMO.bad)], { color: "#ffffff" }, 0)
    .add(q("[data-word]"), { opacity: [0, 1], y: [18, 0], delay: stagger(70), duration: 450 })
    .add(word(DEMO.good), { color: ["#ffffff", LIGHT_GOOD], y: [0, -10, 0], duration: 450 })
    .add(root.querySelector("[data-chip=food]")!, fly(offset(DEMO.good, "food")))
    .add(word(DEMO.bad), { color: ["#ffffff", LIGHT_BAD], y: [0, -10, 0], duration: 450 })
    .add(root.querySelector("[data-chip=service]")!, fly(offset(DEMO.bad, "service")))
    .add(others, { opacity: [0, 0.9], y: [12, 0], delay: stagger(50), duration: 350 })];
}

function collectScene(root: Element): Anim[] {
  const q = (s: string): Els => [...root.querySelectorAll(s)];
  const count = root.querySelector<HTMLElement>("[data-collect-count]")!;
  const box = { n: 0 };
  count.textContent = "0";
  const tl = createTimeline({ defaults: { ease: "inOutSine" } })
    .add(q("[data-source]"), { opacity: [0, 1], y: [28, 0], delay: stagger(110), duration: 550, ease: "outQuad" })
    .add(q("[data-flow]"), { opacity: [0, 1], duration: 1 }, "-=200")
    .add(createDrawable(q("[data-flow] path")), { draw: ["0 0", "0 1"], delay: stagger(80), duration: 650 }, "<");
  [0, 1, 2].forEach((k) => tl.add(q(`[data-p="${k}"]`), {
    ...createMotionPath(root.querySelector(`[data-path="${k}"]`)!), opacity: [0, 1, 1, 0], delay: stagger(70), duration: 1000,
  }, k === 0 ? "+=0" : "<<+=120"));
  tl.add(q("[data-collect-box]"), { opacity: [0, 1], y: [10, 0], duration: 300 }, "<<")
    .add(box, { n: 300, duration: 1400, modifier: Math.round, onUpdate: () => { count.textContent = String(box.n); } }, "<<")
    .add(q("[data-collect-box]"), { scale: [1, 1.06, 1], duration: 350 }, "-=250");
  return [tl];
}

function modelScene(root: Element): Anim[] {
  const q = (s: string): Els => [...root.querySelectorAll(s)];
  const draw = (s: string) => createDrawable(q(s));
  return [createTimeline({ defaults: { ease: "outQuad" } })
    .set(q("[data-seg]"), { scaleX: 0 }, 0) // thanh xác suất nằm trong hàng đang ẩn; co về 0 trước khi hàng hiện
    .add(q("[data-stage-box]"), { opacity: [0, 1], y: [16, 0], delay: stagger(90), duration: 450 })
    .add(q("[data-token]"), { opacity: [0, 1], x: [-14, 0], delay: stagger(70), duration: 350 }, "-=200")
    .add(q("[data-token=phục_vụ]"), { scale: [1, 1.12, 1], duration: 450 })
    .add(q("[data-link=a]"), { opacity: [0, 1], duration: 1 })
    .add(draw("[data-link=a] path"), { draw: ["0 0", "0 1"], duration: 400 }, "<")
    // 12 lớp sáng lên lần lượt từ dưới lên: câu đi qua từng lớp Transformer
    .add(q("[data-layer]"), { opacity: [0.12, 1, 0.7], delay: stagger(70, { from: "last" }), duration: 520 })
    .add(q("[data-cls-box]"), { opacity: [0, 1], duration: 150 }, "-=300")
    .add(q("[data-cls]"), { scale: [0, 1], delay: stagger(18), duration: 300 }, "<")
    .add(q("[data-link=b]"), { opacity: [0, 1], duration: 1 })
    .add(draw("[data-link=b] path"), { draw: ["0 0", "0 1"], duration: 400 }, "<")
    .add(q("[data-head-row]"), { opacity: [0, 1], duration: 250, delay: stagger(60) })
    .add(q("[data-seg]"), { scaleX: [0, 1], delay: stagger(25), duration: 500, ease: "outExpo" }, "-=200")
    .add(q("[data-head-pick]"), { opacity: [0, 1], x: [-8, 0], delay: stagger(60), duration: 300 }, "-=300")
    .add(q("[data-link=c]"), { opacity: [0, 1], duration: 1 })
    .add(draw("[data-link=c] path"), { draw: ["0 0", "0 1"], duration: 400 }, "<")
    .add(q("[data-result]"), { opacity: [0, 1], scale: [0.8, 1], delay: stagger(120), duration: 450, ease: "outBack(1.6)" })];
}

function summaryScene(root: Element): Anim[] {
  const q = (s: string): Els => [...root.querySelectorAll(s)];
  const rnd = (a: number, b: number) => () => utils.random(a, b);
  const nums = root.querySelectorAll<HTMLElement>("[data-tally]");
  const tally = { a: 0, b: 0, c: 0 };
  nums.forEach((el) => { el.textContent = "0"; });
  return [createTimeline()
    .add(q("[data-sq]"), {
      x: { from: rnd(-500, 500), to: 0 }, y: { from: rnd(-260, 260), to: 0 }, rotate: { from: rnd(-160, 160), to: 0 },
      scale: [0.3, 1], opacity: [0, 1],
      delay: stagger(6, { grid: [COLS, SUMMARY.length], from: "center" }), duration: 850, ease: "inOutQuart",
    })
    .add(q("[data-tallies]"), { opacity: [0, 1], duration: 300 }, "-=700")
    .add(tally, {
      a: 300, b: 174, c: 101, duration: 900, modifier: Math.round, ease: "outQuad",
      onUpdate: () => nums.forEach((el, i) => { el.textContent = String([tally.a, tally.b, tally.c][i]); }),
    }, "<")
    .add(q("[data-sum-label]"), { opacity: [0, 1], x: [-12, 0], delay: stagger(70), duration: 400, ease: "outQuad" }, "-=500")];
}

function alertScene(root: Element): Anim[] {
  const q = (s: string): Els => [...root.querySelectorAll(s)];
  return [createTimeline()
    .add(q("[data-trend]"), { opacity: [0, 1], duration: 1 })
    .add(createDrawable(q("[data-trend] path")), { draw: ["0 0", "0 1"], duration: 1200, ease: "inOutSine" }, "<")
    .add(q("[data-spike]"), { scale: [0, 1.6, 1], opacity: [0, 1], duration: 450, ease: "outQuad" })
    .add(q("[data-ripple]"), { scale: [0.2, 4], opacity: [0.9, 0], duration: 650, ease: "outQuad" }, "<<")
    .add(q("[data-trend-label]"), { opacity: [0, 1], duration: 300 }, "<<")
    .add(q("[data-alert-card]"), { opacity: [0, 1], x: [40, 0], duration: 500, ease: "outExpo" })
    .add(q("[data-ai-card]"), { opacity: [0, 1], x: [40, 0], duration: 500, ease: "outExpo" }, "-=250")];
}

function spamScene(root: Element): Anim[] {
  const DUP = [{ x: -420, y: 0, r: -30 }, { x: 0, y: -260, r: 20 }, { x: 420, y: 0, r: 30 }];
  const tl = createTimeline();
  root.querySelectorAll("[data-dup]").forEach((el, i) => tl.add(el, {
    x: [DUP[i].x, 0], y: [DUP[i].y, 0], rotate: [DUP[i].r, 0], opacity: [0, 1], duration: 750, ease: "outExpo",
  }, i * 130));
  tl.add(root.querySelector("[data-stamp]")!, { scale: [3, 1], opacity: [0, 1], rotate: [-25, -8], duration: 280, ease: "inQuad" }, "-=200")
    .add(root.querySelector("[data-spam-stage]")!, { x: [0, -8, 7, -4, 2, 0], duration: 360, ease: "linear" });
  return [tl];
}

const SCENES: Record<string, (root: Element) => Anim[]> = { collect: collectScene, model: modelScene, summary: summaryScene, alert: alertScene, spam: spamScene };

export default function IntroPage() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current!;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.remove("reveal-ready");
      return;
    }
    const made: Anim[] = [];
    // luật ẩn [data-hide] giữ nguyên: anime đặt style trực tiếp (thắng CSS) cho từng phần tử đúng lúc tới lượt nó,
    // nên phần tử chạy sau trong timeline không lộ ra trước lượt
    const play = (scene: HTMLElement) => {
      made.push(...(scene.dataset.scene === "hero" ? heroScene(scene) : SCENES[scene.dataset.scene!]?.(scene) ?? []));
    };
    play(el.querySelector<HTMLElement>("[data-scene=hero]")!);

    // chạy khi phần tử vào hẳn màn hình (đáy màn hình trừ 15%), một lần
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const t = e.target as HTMLElement;
      io.unobserve(t);
      if (t.dataset.scene) play(t);
      else t.classList.add("in");
    }), { rootMargin: "0px 0px -15% 0px", threshold: 0.2 });
    el.querySelectorAll("[data-reveal], [data-scene]:not([data-scene=hero])").forEach((n) => io.observe(n));
    return () => {
      io.disconnect();
      made.forEach((a) => a.revert());
    };
  }, []);

  return (
    <div ref={root} className="reveal-ready overflow-x-clip bg-ground">
      {/* không JavaScript: hiện hết, trang đọc như một bài viết */}
      <noscript><style>{"[data-reveal],[data-hide]{opacity:1!important;transform:none!important}"}</style></noscript>

      <header className="sticky top-0 z-20 border-b border-border bg-ground">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 md:px-8">
          <Link href="/gioi-thieu" className="whitespace-nowrap"><Wordmark /></Link>
          <nav className="flex items-center gap-1">
            <Link href="/login" className="hidden rounded-sm px-3 py-2 text-[14px] whitespace-nowrap text-muted hover:text-ink sm:block">Đăng nhập</Link>
            <Link href="/dashboard" className="btn btn-primary btn-go">Vào ứng dụng</Link>
          </nav>
        </div>
      </header>

      {/* 1. Mở đầu: nền mực, câu của khách được máy đọc ngay trước mắt */}
      <section data-scene="hero" className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 pt-16 pb-20 md:px-8 md:pt-24 md:pb-28 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="anim-rise text-[15px] text-white/70">Cách Quán Nghe hoạt động</p>
            <h1 className="mt-3 text-[44px] leading-[1.05] font-semibold tracking-[-0.03em] md:text-[64px]">
              <span className="line-mask"><span>Mỗi lời khách nói</span></span>
              <span className="line-mask"><span style={{ animationDelay: "90ms" }}>đều được nghe</span></span>
            </h1>
            <p style={{ animationDelay: "250ms" }} className="anim-rise mt-6 max-w-lg text-[17px] leading-[1.6] text-white/75">
              Quán Nghe gom góp ý từ Google Maps và mã QR tại bàn, đọc từng câu, rồi cho bạn biết khách đang khen gì, chê gì và nên sửa gì trước.
            </p>
            <div style={{ animationDelay: "350ms" }} className="anim-rise mt-8 flex flex-wrap items-center gap-4">
              <Link href="/dashboard" className="btn btn-go">Vào ứng dụng</Link>
              <a href="#collect" className="text-[15px] text-white/80 underline decoration-white/30 underline-offset-4 hover:decoration-white">
                Xem một lời góp ý đi qua hệ thống
              </a>
            </div>
          </div>
          <figure className="rounded-xl border border-white/10 p-6 md:p-8">
            <figcaption className="text-[13px] text-white/60">Một câu khách viết qua mã QR</figcaption>
            <p className="mt-3 text-[28px] leading-snug italic md:text-[36px]">
              “{DEMO.text.split(" ").map((w, i) => (
                <span key={i} data-word={w} data-hide className={`inline-block ${w === DEMO.good ? "text-[#7fd6a0]" : w === DEMO.bad ? "text-[#ff9b8f]" : ""}`}>
                  {w}&nbsp;
                </span>
              ))}”
            </p>
            <AspectChips aspects={DEMO.aspects} dark hide />
          </figure>
        </div>
      </section>

      {/* 2. Thu thập */}
      <Section id="collect" step="Bước 1" title="Góp ý đến từ ba nơi" intro="Bạn không phải chép tay. Mọi nguồn đổ về một danh sách chung.">
        <div data-scene="collect">
          <div className="grid gap-3 md:grid-cols-3 md:gap-4">
            {SOURCES.map(([t, d, icon]) => (
              <div key={t} data-source data-hide className="flex gap-4 rounded-lg border border-border bg-surface p-4 md:block md:p-5">
                <Icon3D name={icon} size={56} className="size-12 shrink-0 md:mb-3 md:size-14" />
                <div>
                  <h3 className="heading">{t}</h3>
                  <p className="mt-1 text-muted">{d}</p>
                </div>
              </div>
            ))}
          </div>
          <svg data-flow data-hide viewBox="0 0 900 160" aria-hidden className="hidden h-32 w-full overflow-visible md:block" fill="none">
            {["M150 0 C150 100, 450 60, 450 156", "M450 0 L450 156", "M750 0 C750 100, 450 60, 450 156"].map((d, k) => (
              <path key={k} data-path={k} d={d} stroke="var(--control)" strokeWidth="1.25" />
            ))}
            {[0, 1, 2].flatMap((k) => Array.from({ length: PARTICLES }, (_, i) => (
              <circle key={`${k}-${i}`} data-p={k} r="4.5" fill="var(--accent)" opacity="0" />
            )))}
          </svg>
          <p data-collect-box data-hide className="mx-auto mt-6 w-fit rounded-full border border-border bg-surface px-5 py-2 text-[15px] md:mt-0">
            Một danh sách chung: <b className="num font-semibold"><span data-collect-count>300</span> đánh giá</b>
          </p>
        </div>
      </Section>

      {/* 3. Bên trong máy đọc: PhoBERT tách từ, 12 lớp, 6 đầu phân loại */}
      <Section id="model" step="Bước 2" tone="surface" title="Máy đọc từng câu, tách theo 6 khía cạnh"
        intro="Một câu khách viết thường nói nhiều chuyện cùng lúc. Mô hình PhoBERT đọc cả câu một lần, rồi 6 đầu phân loại trả lời cùng lúc: món ăn, đồ uống, phục vụ, giá, không gian, vị trí được khen, chê hay không được nhắc tới.">
        <ModelDiagram />
      </Section>

      {/* 4. Thử trực tiếp với PhoBERT */}
      <Section id="analyze" title="Thử với câu của bạn"
        intro="Câu bạn gõ được chạy qua đúng mô hình ở trên, không lưu lại. Câu không nói về quán (thời tiết, điện thoại…) thì hệ thống không gán khía cạnh nào.">
        <div data-reveal><LiveTry /></div>
      </Section>

      {/* 4. Tổng hợp */}
      <Section id="summary" step="Bước 3" tone="surface" title="Hàng trăm góp ý thành một bảng"
        intro="Mỗi ô là một lượt khách nhắc tới: đỏ là chê, xám là trung lập, xanh là khen. Khía cạnh bị chê nhiều nhất nằm trên cùng.">
        <div data-scene="summary" className="rounded-lg border border-border bg-surface p-5 md:p-7">
          <div data-tallies data-hide className="mb-6 flex gap-8 md:gap-12">
            {TALLY.map(([l, v]) => (
              <div key={l}>
                <p className="text-[14px] text-muted">{l}</p>
                <p data-tally className="figure text-[32px] leading-10 md:text-[40px] md:leading-[48px]">{v}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2.5">
            {SUMMARY.map(([a, neg, neu]) => (
              <div key={a} className="grid grid-cols-[72px_1fr_40px] items-center gap-3 md:grid-cols-[96px_1fr_48px]">
                <span data-sum-label data-hide className="text-[14px] font-medium">{ASPECT_LABEL[a]}</span>
                <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                  {Array.from({ length: COLS }, (_, c) => <span key={c} data-sq data-hide className={`aspect-square rounded-[1px] ${cellColor(neg, neu, c)}`} />)}
                </div>
                <span data-sum-label data-hide className="num text-right font-medium text-negative">{neg}%</span>
              </div>
            ))}
          </div>
          <p className="pt-4 text-xs text-muted">Số liệu minh họa.</p>
        </div>
      </Section>

      {/* 5. Cảnh báo + gợi ý AI */}
      <Section id="alert" step="Bước 4" title="Chê tăng vọt thì báo ngay, AI gợi ý việc nên làm"
        intro="Hệ thống so tỉ lệ chê 7 ngày qua với 8 tuần trước. Tăng rõ rệt, không phải ngẫu nhiên, thì báo ở đầu trang Tổng quan và trong email sáng thứ Hai.">
        <div data-scene="alert" className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
          <svg data-trend data-hide viewBox="0 0 400 170" role="img" aria-label="Tỉ lệ chê phục vụ theo tuần: ổn định khoảng 18%, tuần này vọt lên 64%" className="w-full overflow-visible">
            <line x1="0" y1="150" x2="400" y2="150" stroke="var(--border)" />
            <path fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round"
              d="M10 128 L55 122 L100 130 L145 118 L190 126 L235 120 L280 124 L325 116 L380 40" />
            <circle data-ripple data-hide cx="380" cy="40" r="10" fill="none" stroke="var(--negative)" strokeWidth="2" style={{ transformOrigin: "380px 40px" }} />
            <circle data-spike data-hide cx="380" cy="40" r="6" fill="var(--negative)" style={{ transformOrigin: "380px 40px" }} />
            <text data-trend-label data-hide x="296" y="28" fill="var(--ink)" fontSize="13" fontWeight="500">64% bị chê</text>
            <text x="10" y="110" fill="var(--muted)" fontSize="12">thường khoảng 18%</text>
          </svg>
          <div className="space-y-3">
            <div data-alert-card data-hide className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
              <span className="rounded-full bg-warn-soft px-2 py-px text-xs font-medium text-warn">Bất thường</span>
              <p className="min-w-0 flex-1"><b className="font-medium">Phục vụ</b> bị chê 64% trong 7 ngày qua (9/14), 8 tuần trước chỉ 18%</p>
            </div>
            <div data-ai-card data-hide className="rounded-lg border border-border bg-surface px-4 py-3">
              <p className="heading">Gợi ý cải thiện: Phục vụ</p>
              <p className="mt-1.5">Khách phàn nàn chờ món lâu vào giờ trưa. Nên thêm một người chạy bàn từ 11 giờ đến 13 giờ, và báo trước thời gian chờ khi quán đông.</p>
              <p className="mt-2 text-[13px] text-muted">AI chạy ngay trên máy của quán, đánh giá của khách không gửi ra ngoài.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. Spam */}
      <Section id="spam" step="Bước 5" tone="surface" title="Review đáng ngờ được gắn cờ"
        intro="Một nội dung đăng lại nhiều lần, một máy gửi dồn dập qua mã QR, nội dung vô nghĩa, số sao ngược với lời viết: hệ thống gắn cờ “Nghi spam”. Quản lý xem lại rồi quyết định có ẩn khỏi thống kê hay không, máy không tự xóa lời của khách.">
        <div data-scene="spam">
          <div data-spam-stage className="relative mx-auto h-44 max-w-md">
            {[0, 1, 2].map((i) => (
              <div key={i} data-dup data-hide className="absolute inset-x-0 top-6 rounded-lg border border-border bg-surface p-4"
                style={{ zIndex: i, translate: `${(i - 1) * 16}px 0`, rotate: `${(i - 1) * 3}deg` }}>
                <p className="hand">Quán dở tệ, phục vụ thái độ khó chịu, không bao giờ quay lại</p>
                <p className="mt-1 text-xs text-muted">Qua mã QR · 1 sao · cách nhau vài giây</p>
              </div>
            ))}
            <span data-stamp data-hide className="absolute -top-1 right-2 z-10 rotate-[-8deg] rounded-sm border-2 border-negative bg-surface px-3 py-1 text-sm font-semibold text-negative">
              Nghi spam
            </span>
          </div>
        </div>
      </Section>

      {/* 7. Vai trò */}
      <Section id="roles" title="Ai làm được gì" intro="Mỗi người được thêm vào quán với một vai trò. Ai cũng xem được số liệu, việc thay đổi dữ liệu thì tùy vai trò.">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {ROLES.map((r, i) => (
            <div key={r.name} data-reveal style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="bg-surface p-5">
              <h3 className="text-[18px] font-semibold">{r.name}</h3>
              <ul className="mt-3 space-y-1.5">
                {r.can.map((c) => <li key={c} className="flex gap-2"><span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-muted" />{c}</li>)}
              </ul>
              {r.plus && <p className="mt-3 text-[14px] text-muted">{r.plus}.</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* 8. Bắt đầu */}
      <Section id="start" tone="surface" title="Bắt đầu trong 5 phút" intro="Việc đầu tiên cho từng vai trò.">
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.who} data-reveal style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="rounded-lg border border-border bg-surface p-5">
              <p className="text-[14px] text-muted"><span className="num">{i + 1}</span>. {s.who}</p>
              <p className="mt-1.5">{s.what}</p>
            </li>
          ))}
        </ol>
        <div data-reveal className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn btn-primary btn-go">Vào Tổng quan</Link>
          <Link href="/login" className="btn">Đăng nhập</Link>
        </div>
      </Section>

      <footer className="border-t border-border px-5 pt-10 pb-28 text-[14px] text-muted md:px-8">
        <div className="mx-auto max-w-6xl space-y-1">
          <p>Phía sau: mô hình PhoBERT (VinAI) huấn luyện thêm trên bộ đánh giá nhà hàng VLSP 2018 để tách cảm xúc theo khía cạnh; Qwen2.5 3B chạy trên máy để viết gợi ý.</p>
          <p>Đồ án chuyên ngành · Hệ thống tự động đánh giá và phân tích phản hồi của khách hàng.</p>
        </div>
      </footer>

      <Ruler />
    </div>
  );
}

// Sơ đồ PhoBERT 4 chặng. Mọi phần tử có data-hide: ẩn sẵn, cảnh modelScene đưa ra theo thứ tự.
function ModelDiagram() {
  const stage = "rounded-lg border border-border bg-surface p-4";
  const title = (n: number, t: string, sub: string) => (
    <div className="mb-3">
      <p className="text-[14px] font-semibold"><span className="num text-accent">{n}.</span> {t}</p>
      <p className="text-[13px] text-muted">{sub}</p>
    </div>
  );
  const link = (id: string) => (
    <svg data-link={id} data-hide viewBox="0 0 40 24" aria-hidden className="mx-auto h-6 w-10 rotate-90 text-control lg:mx-0 lg:mt-24 lg:rotate-0" fill="none">
      <path d="M2 12 H34 M28 6 L36 12 L28 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  return (
    <div data-scene="model" className="grid items-start gap-3 lg:grid-cols-[1fr_40px_1.05fr_40px_1.45fr_40px_1fr] lg:gap-2">
      <div data-stage-box data-hide className={stage}>
        {title(1, "Tách từ", "Bộ tách từ tiếng Việt ghép từ hai tiếng")}
        <p className="hand text-muted">“{DEMO.text}”</p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Các từ sau khi tách">
          {TOKENS.map((t) => (
            <li key={t} data-token={t} data-hide
              className={`num rounded-sm border px-2 py-0.5 text-[13px] ${t.startsWith("<") ? "border-dashed border-control text-muted" : t.includes("_") ? "border-accent text-accent" : "border-border"}`}>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-muted">&lt;s&gt; và &lt;/s&gt; đánh dấu đầu, cuối câu.</p>
      </div>
      {link("a")}
      <div data-stage-box data-hide className={stage}>
        {title(2, "PhoBERT", "12 lớp Transformer, 135 triệu tham số, học trước trên 20 GB chữ tiếng Việt")}
        <div className="flex flex-col-reverse gap-[3px]" role="img" aria-label="12 lớp Transformer">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} data-layer data-hide className="h-[9px] rounded-[2px] bg-accent" />
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">Ra một vector [CLS] gồm 768 số tóm tắt cả câu:</p>
        <div data-cls-box data-hide className="mt-1.5 grid grid-cols-16 gap-[2px]" role="img" aria-label="Vector 768 chiều, vẽ rút gọn 32 ô">
          {CLS_CELLS.map((o, i) => <span key={i} data-cls className="aspect-square rounded-[1px] bg-ink" style={{ opacity: o }} />)}
        </div>
      </div>
      {link("b")}
      <div data-stage-box data-hide className={stage}>
        {title(3, "6 đầu phân loại", "Mỗi khía cạnh chia 100% cho 4 nhãn, nhãn lớn nhất thắng")}
        <ul className="space-y-2">
          {HEADS.map(([a, probs]) => {
            const pick = probs.indexOf(Math.max(...probs));
            return (
              <li key={a} data-head-row data-hide className="grid grid-cols-[68px_1fr_auto] items-center gap-2 text-[13px]">
                <span className="font-medium">{ASPECT_LABEL[a]}</span>
                <span className="flex h-2.5 gap-px overflow-hidden rounded-[2px]" role="img"
                  aria-label={HEAD_ORDER.map((k) => `${HEAD_LABEL[k]} ${Math.round(probs[k] * 100)}%`).join(", ")}>
                  {HEAD_ORDER.map((k) => (
                    <span key={k} data-seg className="origin-left" style={{ flexGrow: probs[k], background: HEAD_COLOR[k] }} />
                  ))}
                </span>
                <span data-head-pick data-hide className={`num text-right whitespace-nowrap ${pick === 0 ? "text-muted" : "font-medium"}`}>
                  {HEAD_LABEL[pick]} {Math.round(probs[pick] * 100)}%
                </span>
              </li>
            );
          })}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
          {HEAD_ORDER.map((k) => (
            <li key={k} className="flex items-center gap-1"><span aria-hidden className="h-2 w-3 rounded-[1px]" style={{ background: HEAD_COLOR[k] }} />{HEAD_LABEL[k]}</li>
          ))}
        </ul>
      </div>
      {link("c")}
      <div data-stage-box data-hide className={stage}>
        {title(4, "Lọc chủ đề, ra kết quả", "Giữ khía cạnh khi câu có từ thuộc khía cạnh đó")}
        <ul className="space-y-2">
          {HEADS.filter(([, p]) => p.indexOf(Math.max(...p)) !== 0).map(([a, p]) => {
            const s = (["none", "positive", "neutral", "negative"] as const)[p.indexOf(Math.max(...p))] as Sentiment;
            return (
              <li key={a} data-result data-hide>
                <span className={`rounded-full px-2.5 py-0.5 text-[14px] font-medium ${SENTIMENT_PILL[s]}`}>{ASPECT_LABEL[a]}: {SENTIMENT_LABEL[s].toLowerCase()}</span>
                <p className="mt-1 text-[12px] text-muted">có {CUE_HIT[a]}</p>
              </li>
            );
          })}
        </ul>
        <p data-result data-hide className="mt-3 text-[13px] text-muted">4 khía cạnh còn lại: không được nhắc tới.</p>
      </div>
    </div>
  );
}

// Thanh mục lục ở đáy màn hình: phần đang đọc và tiến độ, bấm để nhảy tới. Chỉ màn rộng: hẹp hơn thì nó che tiêu đề khi cuộn qua.
function Ruler() {
  const fill = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  const [current, setCurrent] = useState(-1);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (fill.current) fill.current.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      setShown(scrollY > innerHeight * 0.6);
      setCurrent(CHAPTERS.findLastIndex(([id]) => (document.getElementById(id)?.getBoundingClientRect().top ?? 1) <= innerHeight / 2));
    };
    const onScrollEvt = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", onScrollEvt, { passive: true });
    addEventListener("resize", onScrollEvt);
    return () => { removeEventListener("scroll", onScrollEvt); removeEventListener("resize", onScrollEvt); cancelAnimationFrame(frame); };
  }, []);
  return (
    <nav aria-label="Các phần của trang"
      className={`fixed bottom-4 left-1/2 z-30 hidden w-[min(92vw,620px)] -translate-x-1/2 rounded-lg border border-border bg-surface px-3 pt-2 pb-2.5 transition-opacity duration-300 lg:block ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      <ol className="flex justify-between">
        {CHAPTERS.map(([id, label], i) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={i === current ? "step" : undefined}
              className={`block px-1.5 py-0.5 text-[13px] ${i === current ? "font-medium text-ink" : "text-muted hover:text-ink"}`}>
              {label}
            </a>
          </li>
        ))}
      </ol>
      <span className="mt-1.5 block h-px w-full bg-border">
        <span ref={fill} className="block h-px origin-left bg-accent" style={{ transform: "scaleX(0)" }} />
      </span>
    </nav>
  );
}

// Một phần của trang. tone: nền trắng hoặc nền đá (xen kẽ để tách phần mà không cần đường kẻ dày).
function Section({ id, step, title, intro, tone, children }: {
  id: string; step?: string; title: string; intro: string; tone?: "surface"; children: React.ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-14 border-t border-border ${tone === "surface" ? "bg-surface" : "bg-ground"}`}>
      <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
        <div data-reveal className="max-w-2xl">
          {step && <p className="text-[14px] font-medium text-accent">{step}</p>}
          <h2 className="mt-1 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] md:text-[40px]">{title}</h2>
          <p className="mt-3 mb-8 text-[16px] leading-[1.6] text-muted md:mb-12 md:text-[17px]">{intro}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

// 6 khía cạnh; khía cạnh được nhắc thì bật màu khen/chê, còn lại mờ. hide: ẩn sẵn chờ cảnh mở đầu chạy
function AspectChips({ aspects, live, dark, hide }: { aspects: Record<string, string>; live?: boolean; dark?: boolean; hide?: boolean }) {
  return (
    <ul className="mt-6 flex flex-wrap gap-2" aria-label="Kết quả theo khía cạnh">
      {ASPECTS.map((a) => {
        const s = aspects[a] as Sentiment | undefined;
        return (
          <li key={a} data-chip={a} data-hide={hide || undefined} data-live-chip={live && s ? "" : undefined}
            className={`rounded-full px-3 py-1 text-[14px] font-medium ${s ? SENTIMENT_PILL[s] : dark ? "border border-white/15 text-white/55" : "border border-border text-muted"}`}>
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
  const [result, setResult] = useState<{ sentiment: Sentiment; aspects: Record<string, string>; about_store: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const out = useRef<HTMLDivElement>(null);

  async function run(t: string) {
    if (t.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ sentiment: Sentiment; aspects: Record<string, string>; about_store: boolean }>("/public/analyze", json("POST", { text: t }));
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
    <div className="rounded-lg border border-border bg-surface p-5 md:p-7">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); run(text); }}>
        <label htmlFor="try" className="sr-only">Câu góp ý để phân tích</label>
        <input id="try" className="input sm:flex-1" maxLength={300} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ví dụ: Bún bò đậm vị nhưng chờ hơi lâu" />
        <button className="btn btn-primary btn-go h-11" disabled={busy || text.trim().length < 2}>{busy ? "Đang đọc…" : "Phân tích"}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
        <span className="text-muted">Hoặc chọn:</span>
        {SAMPLES.map((s) => (
          <button key={s} type="button" className="tap cursor-pointer text-ink underline decoration-control underline-offset-4 hover:decoration-ink"
            onClick={() => { setText(s); run(s); }}>
            {s}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 text-negative">{error}</p>}
      <div ref={out} aria-live="polite">
        {result && (
          <div className="mt-6 border-t border-rule pt-5">
            <p className="hand text-muted">“{result.text}”</p>
            <p data-live-overall className="mt-3">
              Cả câu: <span className={`rounded-full px-2.5 py-0.5 text-[14px] font-medium ${SENTIMENT_PILL[result.sentiment]}`}>{SENTIMENT_LABEL[result.sentiment]}</span>
            </p>
            {Object.keys(result.aspects).length > 0 ? <AspectChips aspects={result.aspects} live />
              : result.about_store ? <p className="mt-3 text-muted">Câu này không nhắc tới khía cạnh nào trong 6 khía cạnh (món ăn, đồ uống, phục vụ, giá, không gian, vị trí).</p>
              : <p className="mt-3 rounded-sm bg-warn-soft px-3 py-2 text-warn">Câu này có vẻ không nói về quán ăn, nên hệ thống không gán khía cạnh nào. Cảm xúc cả câu ở trên chỉ để tham khảo.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
