"use client";

import { Icon3D, type Icon3DName } from "@/components/icon3d";
import { Wordmark } from "@/components/mark";
import { api, json, type Sentiment } from "@/lib/api";
import { ASPECT_LABEL, SENTIMENT_LABEL, SENTIMENT_PILL } from "@/lib/labels";
import {
  animate, createDrawable, createMotionPath, createScope, createTimeline, onScroll, splitText, stagger, utils,
} from "animejs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/*
 * Trang giới thiệu công khai: kể đường đi của một lời góp ý.
 * Các cảnh lớn "ghim" màn hình (khối cao 260vh, nội dung sticky) và một timeline anime.js được tua theo thanh cuộn,
 * kiểu animejs.com. Người dùng bật "giảm chuyển động" (hoặc không có JavaScript) thì không ghim, không hiệu ứng,
 * mọi phần tử ở trạng thái cuối: trang đọc như một bài viết bình thường.
 */

const ASPECTS = ["food", "drink", "service", "price", "ambience", "location"] as const;
const SAMPLES = [
  "Phở ngon nhưng phục vụ chậm",
  "Cà phê thơm, giá hơi cao so với chất lượng",
  "Không gian yên tĩnh, rất hợp để ngồi học",
  "Chỗ để xe khó tìm, nhân viên thì dễ thương",
];
// câu mẫu ở cảnh phân tích: từ khen/chê và khía cạnh nó bay tới
const DEMO = { text: "Phở ngon nhưng phục vụ chậm", good: "ngon", bad: "chậm", aspects: { food: "positive", service: "negative" } };

// cảnh tổng hợp: mỗi khía cạnh một hàng ô vuông, tỉ lệ chê | trung lập | khen (số minh họa từ quán demo)
const SUMMARY: [string, number, number][] = [["service", 54, 4], ["location", 43, 0], ["price", 43, 2], ["food", 11, 10]];
const COLS = 40;
const cellColor = (neg: number, neu: number, c: number) =>
  c < (neg * COLS) / 100 ? "bg-negative" : c < ((neg + neu) * COLS) / 100 ? "bg-[#c3c9d4]" : "bg-positive";

const PARTICLES = 15; // hạt trên mỗi đường ở cảnh thu thập

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

const CHAPTERS = [["collect", "Thu thập"], ["analyze", "Phân tích"], ["summary", "Tổng hợp"], ["alert", "Cảnh báo"], ["spam", "Spam"], ["roles", "Vai trò"], ["start", "Bắt đầu"]];

// cảnh ghim: timeline chạy từ lúc khối chạm đỉnh màn hình tới lúc đáy khối rời đi
const pinned = (id: string) => onScroll({ target: `[data-section=${id}] [data-pin]`, enter: "start start", leave: "end end", sync: 0.25 });

export default function IntroPage() {
  const root = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(false); // false lúc render phía server: trang tĩnh, không ghim

  useEffect(() => setMotion(!matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  useEffect(() => {
    if (!motion) return;
    const scope = createScope({ root }).add(() => {
      const rnd = (a: number, b: number) => () => utils.random(a, b);

      // 1. Mở đầu: chữ nằm rải rác, xoay lộn xộn rồi bay về ghép thành câu;
      //    cuộn xuống thì cả khối phóng to và mờ đi như đi xuyên qua
      animate(createDrawable("[data-hero-mark] path"), { draw: ["0 0", "0 1"], duration: 1400, ease: "inOutQuad" });
      const { chars } = splitText("[data-hero-title]", { chars: true });
      animate(chars, {
        x: { from: rnd(-420, 420) }, y: { from: rnd(-260, 260) }, rotate: { from: rnd(-120, 120) },
        scale: { from: 0.4 }, opacity: { from: 0 },
        delay: stagger(18, { from: "random" }), duration: 1300, ease: "outExpo",
      });
      animate("[data-hero-sub]", { opacity: [0, 1], y: [16, 0], delay: 1100, duration: 700, ease: "outQuad" });
      animate("[data-hero-inner]", {
        scale: [1, 1.35], opacity: [1, 0], y: [0, -80], ease: "linear",
        autoplay: onScroll({ target: "[data-hero]", enter: "start start", leave: "start end", sync: true }),
      });

      // 2. Thu thập: đường vẽ ra, hạt sáng chảy dọc 3 đường về hộp chung, số trong hộp tăng theo
      // timeline chỉ vẽ một bước khi tới lượt nó: phần tử chạy sau phải được .set() trạng thái đầu ở thời điểm 0,
      // nếu không chúng hiện sẵn trước lượt (cuộn ngược về đầu cũng trả về đúng trạng thái này)
      const box = { n: 0 };
      const count = document.querySelector<HTMLElement>("[data-collect-count]");
      if (count) count.textContent = "0";
      const collect = createTimeline({ autoplay: pinned("collect"), defaults: { ease: "inOutSine" } })
        .add("[data-source]", { opacity: [0, 1], y: [40, 0], scale: [0.9, 1], delay: stagger(120), duration: 500 })
        .add(createDrawable("[data-flow] path"), { draw: ["0 0", "0 1"], delay: stagger(80), duration: 600 }, "-=200");
      [0, 1, 2].forEach((k) => collect.add(`[data-p="${k}"]`, {
        ...createMotionPath(`[data-path="${k}"]`), opacity: [0, 1, 1, 0], delay: stagger(70), duration: 1100,
      }, k === 0 ? "+=0" : "<<+=120"));
      collect
        .add(box, { n: 300, duration: 1600, modifier: Math.round, onUpdate: () => { if (count) count.textContent = String(box.n); } }, "<<")
        .add("[data-collect-box]", { scale: [1, 1.08, 1], duration: 400 }, "-=300");

      // 3. Phân tích: câu phóng to; "ngon" sáng xanh rồi thẻ Món ăn bay ra từ chữ đó, "chậm" sáng đỏ rồi tới Phục vụ
      const stage = document.querySelector("[data-stage=analyze]");
      const from = (word: string, chip: string) => {
        const w = stage?.querySelector(`[data-word="${word}"]`)?.getBoundingClientRect();
        const c = stage?.querySelector(`[data-chip="${chip}"]`)?.getBoundingClientRect();
        return w && c ? { x: w.left + w.width / 2 - (c.left + c.width / 2), y: w.top + w.height / 2 - (c.top + c.height / 2) } : { x: 0, y: -60 };
      };
      const fGood = from(DEMO.good, "food");
      const fBad = from(DEMO.bad, "service");
      const sel = (q: string) => `[data-stage=analyze] ${q}`;
      // chữ nảy lên thay vì phóng to: phóng to làm chữ đè lên chữ bên cạnh
      const fly = (f: { x: number; y: number }) => ({ x: [f.x, 0], y: [f.y, 0], scale: [0.2, 1], opacity: [0, 1], duration: 700, ease: "outBack(1.4)" });
      createTimeline({ autoplay: pinned("analyze"), defaults: { ease: "outQuad" } })
        .set(sel("[data-chip]"), { opacity: 0 }, 0)
        .set(sel(`[data-word="${DEMO.good}"], [data-word="${DEMO.bad}"]`), { color: "#fcf9f0" }, 0)
        .add(sel("[data-word]"), { opacity: [0.08, 1], y: [30, 0], delay: stagger(90), duration: 500 })
        .add(sel(`[data-word="${DEMO.good}"]`), { color: ["#fcf9f0", "#7fd6a0"], y: [0, -14, 0], duration: 500 })
        .add(sel("[data-chip=food]"), fly(fGood))
        .add(sel(`[data-word="${DEMO.bad}"]`), { color: ["#fcf9f0", "#ff9b8f"], y: [0, -14, 0], duration: 500 })
        .add(sel("[data-chip=service]"), fly(fBad))
        .add(sel("[data-chip]:not([data-chip=food]):not([data-chip=service])"), { opacity: [0, 1], y: [20, 0], delay: stagger(60), duration: 400 });

      // 4. Tổng hợp: ô vuông rơi rải rác như từng review, rồi tự xếp thành 4 thanh khen/chê
      const tally = { a: 0, b: 0, c: 0 };
      const nums = document.querySelectorAll<HTMLElement>("[data-tally]");
      nums.forEach((el) => { el.textContent = "0"; });
      createTimeline({ autoplay: pinned("summary") })
        .set("[data-sum-label]", { opacity: 0 }, 0)
        .add("[data-sq]", {
          x: { from: rnd(-700, 700), to: 0 }, y: { from: rnd(-420, 420), to: 0 }, rotate: { from: rnd(-200, 200), to: 0 },
          scale: [0.3, 1], opacity: [0, 1],
          delay: stagger(8, { grid: [COLS, SUMMARY.length], from: "center" }), duration: 900, ease: "inOutQuart",
        })
        .add(tally, {
          a: 300, b: 174, c: 101, duration: 900, modifier: Math.round, ease: "outQuad",
          onUpdate: () => nums.forEach((el, i) => { el.textContent = String([tally.a, tally.b, tally.c][i]); }),
        }, "-=700")
        .add("[data-sum-label]", { opacity: [0, 1], x: [-16, 0], delay: stagger(80), duration: 400 }, "-=500");

      // 5. Cảnh báo: đường biểu đồ vẽ theo cuộn; tới tuần vọt lên thì chấm đỏ nổ thành vòng sóng, khung rung,
      //    rồi thẻ cảnh báo và gợi ý AI trượt vào
      const ai = splitText("[data-ai-text]", { words: true });
      createTimeline({ autoplay: pinned("alert") })
        .set("[data-spike]", { scale: 0 }, 0)
        .set("[data-ripple]", { opacity: 0 }, 0)
        .set("[data-alert-card], [data-ai-card]", { opacity: 0 }, 0)
        .set(ai.words, { opacity: 0 }, 0)
        .add(createDrawable("[data-trend] path"), { draw: ["0 0", "0 1"], duration: 1400, ease: "inOutSine" })
        .add("[data-spike]", { scale: [0, 1.6, 1], duration: 500, ease: "outQuad" })
        .add("[data-ripple]", { scale: [0.2, 4], opacity: [0.9, 0], duration: 700, ease: "outQuad" }, "<<")
        .add("[data-alert-stage]", { x: [0, -10, 9, -6, 4, 0], duration: 450, ease: "linear" }, "<<")
        .add("[data-alert-card]", { opacity: [0, 1], x: [80, 0], duration: 500, ease: "outExpo" })
        .add("[data-ai-card]", { opacity: [0, 1], x: [80, 0], duration: 500, ease: "outExpo" }, "-=250")
        .add(ai.words, { opacity: [0, 1], delay: stagger(30), duration: 150 });

      // 6. Spam (không ghim): 3 thẻ bay từ 3 hướng chồng lên nhau, con dấu đập xuống, cả khung rung
      const DUP = [{ x: -600, y: 0, r: -40 }, { x: 0, y: -400, r: 25 }, { x: 600, y: 0, r: 40 }];
      const spam = createTimeline({ autoplay: onScroll({ target: "[data-section=spam]", enter: "65% start" }) })
        .set("[data-dup], [data-stamp]", { opacity: 0 }, 0);
      document.querySelectorAll("[data-dup]").forEach((el, i) => spam.add(el, {
        x: [DUP[i].x, 0], y: [DUP[i].y, 0], rotate: [DUP[i].r, 0], opacity: [0, 1],
        duration: 800, ease: "outExpo",
      }, i * 140));
      spam
        .add("[data-stamp]", { scale: [3.5, 1], opacity: [0, 1], rotate: [-30, -8], duration: 300, ease: "inQuad" }, "-=200")
        .add("[data-spam-stage]", { x: [0, -12, 10, -6, 3, 0], y: [0, 4, -3, 2, 0, 0], duration: 400, ease: "linear" });

      // 7, 8. Vai trò và bước đầu: lần lượt lật lên
      ["roles", "start"].forEach((s) => animate(`[data-section=${s}] [data-rise]`, {
        opacity: [0, 1], y: [60, 0], rotateX: [-25, 0], delay: stagger(130), duration: 900, ease: "outExpo",
        autoplay: onScroll({ target: `[data-section=${s}]`, enter: "80% start" }),
      }));
    });
    return () => { scope.revert(); };
  }, [motion]);

  return (
    <div ref={root} className="overflow-x-clip">
      <header className="on-dark sticky top-0 z-20 flex h-14 items-center justify-between px-5 md:px-10">
        <Link href="/gioi-thieu"><Wordmark /></Link>
        <Link href="/dashboard" className="btn btn-gold btn-go">Vào ứng dụng</Link>
      </header>

      {/* 1. Mở đầu */}
      <section data-hero className="on-dark relative flex min-h-[calc(100svh-56px)] flex-col justify-center overflow-hidden px-5 pb-16 md:px-10">
        <div data-hero-inner className="relative mx-auto w-full max-w-5xl">
          <svg data-hero-mark viewBox="0 0 20 20" aria-hidden className="mb-8 size-14 md:size-20">
            <path fill="none" stroke="var(--gold)" strokeWidth="0.8" d="M2 11.5C2 7.4 4.3 4.6 8 3.5l.8 1.6C6.6 6 5.5 7.6 5.4 9.6H8.5V16H2v-4.5Zm9.5 0c0-4.1 2.3-6.9 6-8l.8 1.6c-2.2.9-3.3 2.5-3.4 4.5H18V16h-6.5v-4.5Z" />
          </svg>
          <p className="text-[13px] font-semibold tracking-[0.1em] text-on-dark-muted uppercase">Cách Quán Nghe hoạt động</p>
          <h1 data-hero-title className="mt-4 max-w-4xl font-display text-[48px] leading-[1.02] font-normal tracking-[-0.02em] text-gold md:text-[92px]">
            Mỗi lời khách nói đều được nghe
          </h1>
          <p data-hero-sub className="mt-6 max-w-xl text-[17px] leading-[1.5] md:text-[19px]">
            Quán Nghe gom góp ý từ Google Maps và mã QR tại bàn, đọc từng câu, rồi cho bạn biết khách đang khen gì, chê gì và nên sửa gì trước.
            Kéo xuống để xem một lời góp ý đi qua hệ thống thế nào.
          </p>
        </div>
      </section>

      {/* 2. Thu thập */}
      <Section id="collect" step="1" title="Góp ý đến từ ba nơi" intro="Bạn không phải chép tay. Mọi nguồn đổ về một chỗ." pin={motion}>
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {([
            ["Google Maps", "Tải đánh giá của quán về thành file, rồi nhập vào. Review đã có thì tự bỏ qua.", "map-pin"],
            ["Mã QR tại bàn", "Khách quét mã, chấm sao, viết vài dòng. Không cần cài app.", "mobile"],
            ["Nhập tay", "Góp ý nghe ở quầy, hoặc file Excel có sẵn của quán.", "pencil"],
          ] as const).map(([t, d, icon]) => (
            <div key={t} data-source className="panel p-3 md:p-5">
              <Icon3D name={icon} size={64} className="mb-2 size-10 md:size-16" />
              <h3 className="heading">{t}</h3>
              <p className="mt-2 hidden text-muted sm:block">{d}</p>
            </div>
          ))}
        </div>
        <svg data-flow viewBox="0 0 900 200" aria-hidden className="block h-24 w-full overflow-visible md:h-40" fill="none">
          {["M150 0 C150 120, 450 80, 450 196", "M450 0 L450 196", "M750 0 C750 120, 450 80, 450 196"].map((d, k) => (
            <path key={k} data-path={k} d={d} stroke="var(--blue)" strokeWidth="1.5" />
          ))}
          {motion && [0, 1, 2].flatMap((k) => Array.from({ length: PARTICLES }, (_, i) => (
            <circle key={`${k}-${i}`} data-p={k} r="5" fill="var(--gold)" stroke="var(--navy)" strokeWidth="1" opacity="0" />
          )))}
        </svg>
        <p data-collect-box className="mx-auto w-fit rounded-sm bg-navy px-4 py-2 text-center text-[13px] font-semibold tracking-[0.08em] text-cream uppercase">
          Một danh sách chung · <span data-collect-count className="num text-gold">300</span> đánh giá
        </p>
      </Section>

      {/* 3. Phân tích + thử trực tiếp */}
      <Section id="analyze" icon="chat-bubble" step="2" title="Máy đọc từng câu, tách theo 6 khía cạnh" dark pin={motion}
        intro="Một câu khách viết thường nói nhiều chuyện cùng lúc. Hệ thống xem từng chuyện: món ăn, phục vụ, giá… được khen hay bị chê."
        after={<LiveTry />}>
        <p className="font-display text-[36px] leading-snug tracking-[-0.01em] italic md:text-[60px]">
          “{DEMO.text.split(" ").map((w, i) => (
            <span key={i} data-word={w} className={`inline-block ${w === DEMO.good ? "text-[#7fd6a0]" : w === DEMO.bad ? "text-[#ff9b8f]" : ""}`}>
              {w}&nbsp;
            </span>
          ))}”
        </p>
        <AspectChips aspects={DEMO.aspects} />
      </Section>

      {/* 4. Tổng hợp */}
      <Section id="summary" icon="chart" step="3" title="Hàng trăm góp ý thành một bảng" pin={motion}
        intro="Mỗi ô là một lượt khách nhắc tới: đỏ là chê, xám là trung lập, xanh là khen. Khía cạnh bị chê nhiều nhất nằm trên cùng.">
        <div className="mb-6 flex gap-6 md:gap-10">
          {[["Đánh giá", 300], ["Khen", 174], ["Chê", 101]].map(([l, v]) => (
            <div key={l}>
              <p className="text-sm text-muted">{l}</p>
              <p data-tally className="figure text-[34px] leading-9 md:text-[48px] md:leading-[52px]">{v}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2.5">
          {SUMMARY.map(([a, neg, neu]) => (
            <div key={a} className="grid grid-cols-[72px_1fr_40px] items-center gap-3 md:grid-cols-[96px_1fr_48px]">
              <span data-sum-label className="text-sm font-medium md:text-[15px]">{ASPECT_LABEL[a]}</span>
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                {Array.from({ length: COLS }, (_, c) => <span key={c} data-sq className={`aspect-square rounded-[1px] ${cellColor(neg, neu, c)}`} />)}
              </div>
              <span data-sum-label className="num text-right font-medium text-negative">{neg}%</span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted">Số liệu minh họa từ quán demo.</p>
        </div>
      </Section>

      {/* 5. Cảnh báo + gợi ý AI */}
      <Section id="alert" icon="bell" step="4" title="Chê tăng vọt thì báo ngay, AI gợi ý việc nên làm" dark pin={motion}
        intro="Hệ thống so tỉ lệ chê 7 ngày qua với 8 tuần trước. Tăng rõ rệt, không phải ngẫu nhiên, thì báo ở đầu trang Tổng quan và trong email sáng thứ Hai.">
        <div data-alert-stage className="grid items-center gap-6 lg:grid-cols-2 lg:gap-8">
          <svg data-trend viewBox="0 0 400 170" aria-label="Tỉ lệ chê phục vụ theo tuần: ổn định khoảng 18%, tuần này vọt lên 64%" role="img" className="max-h-28 w-full overflow-visible md:max-h-none">
            <line x1="0" y1="150" x2="400" y2="150" stroke="#22324f" />
            <path fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinejoin="round"
              d="M10 128 L55 122 L100 130 L145 118 L190 126 L235 120 L280 124 L325 116 L380 40" />
            <circle data-ripple cx="380" cy="40" r="10" fill="none" stroke="var(--negative)" strokeWidth="2" opacity="0" style={{ transformOrigin: "380px 40px" }} />
            <circle data-spike cx="380" cy="40" r="7" fill="var(--negative)" style={{ transformOrigin: "380px 40px" }} />
            <text x="300" y="30" fill="var(--cream)" fontSize="13">64% bị chê</text>
            <text x="10" y="110" fill="var(--on-dark-muted)" fontSize="12">thường khoảng 18%</text>
          </svg>
          <div className="space-y-4">
            {/* điện thoại: cảnh ghim không đủ cao cho cả hai thẻ; biểu đồ đã ghi 64% so với 18% nên bỏ thẻ này */}
            <div data-alert-card className="hidden rounded-lg border border-[#22324f] p-4 md:block">
              <p className="text-[12px] font-semibold tracking-[0.08em] text-gold uppercase">Bất thường trong 7 ngày qua</p>
              <p className="mt-1">Phục vụ bị chê 64% lượt nhắc (9/14), thường chỉ 18%.</p>
            </div>
            <div data-ai-card className="on-light rounded-lg bg-surface p-4 text-ink">
              <p className="heading flex items-center gap-2"><Icon3D name="bulb" size={28} />Gợi ý cải thiện · Phục vụ</p>
              <p data-ai-text className="mt-2">
                Khách phàn nàn chờ món lâu vào giờ trưa. Nên thêm một người chạy bàn từ 11 giờ đến 13 giờ, và báo trước thời gian chờ khi quán đông.
              </p>
              <p className="mt-2 hidden text-xs text-muted md:block">AI chạy ngay trên máy của quán, đánh giá của khách không gửi ra ngoài.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. Spam */}
      <Section id="spam" icon="shield" step="5" title="Review đáng ngờ được gắn cờ" intro="Một nội dung đăng lại nhiều lần, một máy gửi dồn dập qua mã QR, nội dung vô nghĩa, số sao ngược với lời viết: hệ thống gắn cờ “Nghi spam”. Quản lý xem lại rồi quyết định có ẩn khỏi thống kê hay không, máy không tự xóa lời của khách.">
        <div data-spam-stage className="relative mx-auto h-44 max-w-md">
          {[0, 1, 2].map((i) => (
            <div key={i} data-dup className="panel absolute inset-x-0 top-6 p-4" style={{ zIndex: i, translate: `${(i - 1) * 18}px 0`, rotate: `${(i - 1) * 4}deg` }}>
              <p className="hand">Quán dở tệ, phục vụ thái độ khó chịu, không bao giờ quay lại</p>
              <p className="mt-1 text-xs text-muted">Qua mã QR · 1★ · cách nhau vài giây</p>
            </div>
          ))}
          <span data-stamp className="absolute -top-1 right-2 z-10 rotate-[-8deg] rounded-sm border-2 border-negative bg-surface px-3 py-1 text-sm font-bold tracking-[0.08em] text-negative uppercase">
            Nghi spam
          </span>
        </div>
      </Section>

      {/* 7. Vai trò */}
      <Section id="roles" icon="key" step="6" title="Ai làm được gì" dark intro="Mỗi người được thêm vào quán với một vai trò. Ai cũng xem được số liệu, việc thay đổi dữ liệu thì tùy vai trò.">
        <div className="grid gap-4 [perspective:900px] md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.name} data-rise className="rounded-lg border border-[#22324f] p-5">
              <h3 className="font-display text-[24px] font-medium tracking-[-0.01em] text-gold">{r.name}</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                {r.can.map((c) => <li key={c}>{c}</li>)}
              </ul>
              {r.plus && <p className="mt-3 text-sm text-on-dark-muted">{r.plus}.</p>}
            </div>
          ))}
        </div>
      </Section>

      {/* 8. Bắt đầu */}
      <Section id="start" icon="rocket" step="7" title="Bắt đầu trong 5 phút" intro="Việc đầu tiên cho từng vai trò.">
        <ol className="grid gap-4 [perspective:900px] md:grid-cols-3">
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

      <footer className="on-dark px-5 pt-10 pb-28 text-sm md:px-10">
        <div className="mx-auto max-w-5xl space-y-1 text-on-dark-muted">
          <p>Phía sau: mô hình PhoBERT (VinAI) huấn luyện thêm trên bộ đánh giá nhà hàng VLSP 2018 để tách cảm xúc theo khía cạnh; Qwen2.5 3B chạy trên máy để viết gợi ý.</p>
          <p>Đồ án chuyên ngành · Hệ thống tự động đánh giá và phân tích phản hồi của khách hàng.</p>
        </div>
      </footer>

      <Ruler />
    </div>
  );
}

// Thước tiến trình ở đáy màn hình (kiểu thước phim của animejs.com): vạch 01–07, bấm để nhảy tới phần đó.
// Ẩn trên điện thoại: che mất đáy các cảnh ghim vốn đã chật
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
      setCurrent(CHAPTERS.findLastIndex(([id]) => (document.querySelector(`[data-section=${id}]`)?.getBoundingClientRect().top ?? 1) <= innerHeight / 2));
    };
    const onScrollEvt = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", onScrollEvt, { passive: true });
    addEventListener("resize", onScrollEvt);
    return () => { removeEventListener("scroll", onScrollEvt); removeEventListener("resize", onScrollEvt); cancelAnimationFrame(frame); };
  }, []);
  return (
    <nav aria-label="Các phần của trang"
      className={`on-dark fixed bottom-4 left-1/2 z-30 hidden w-[min(92vw,560px)] md:block -translate-x-1/2 rounded-lg px-3 pt-2 pb-2.5 transition-opacity duration-300 ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      <ol className="flex justify-between">
        {CHAPTERS.map(([id, label], i) => (
          <li key={id}>
            <button type="button" aria-current={i === current ? "step" : undefined}
              onClick={() => document.querySelector(`[data-section=${id}]`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
              className={`num flex cursor-pointer flex-col items-center px-1 text-[11px] tracking-[0.06em] ${i === current ? "text-gold" : "text-on-dark-muted hover:text-cream"}`}>
              {String(i + 1).padStart(2, "0")}
              <span className="hidden sm:inline">{label}</span>
            </button>
          </li>
        ))}
      </ol>
      <span className="mt-1.5 block h-px w-full bg-[#22324f]">
        <span ref={fill} className="block h-px origin-left bg-gold" style={{ transform: "scaleX(0)" }} />
      </span>
    </nav>
  );
}

// Một phần của trang. pin: khối cao 260vh, nội dung ghim giữa màn hình để timeline tua theo cuộn.
// after: nội dung nằm sau cảnh ghim (ô thử trực tiếp), cuộn bình thường.
function Section({ id, step, title, intro, icon, dark, pin, after, children }: {
  id: string; step: string; title: string; intro: string; icon?: Icon3DName; dark?: boolean; pin?: boolean; after?: React.ReactNode; children: React.ReactNode;
}) {
  const head = (
    <>
      <div className="flex items-end justify-between gap-4">
        <p className={`num text-[13px] font-semibold tracking-[0.1em] uppercase ${dark ? "text-gold" : "text-blue"}`}>{step.padStart(2, "0")}</p>
        {icon && <Icon3D name={icon} size={112} className="float -mb-6 size-14 md:-mb-10 md:size-28" />}
      </div>
      <h2 className={`mt-2 max-w-3xl font-display text-[32px] leading-[1.1] font-medium tracking-[-0.015em] md:text-[50px] ${dark ? "text-cream" : "text-ink"}`}>{title}</h2>
      <p className={`mt-3 mb-6 max-w-2xl text-[15px] leading-[1.5] md:mt-4 md:mb-10 md:text-[17px] ${dark ? "text-on-dark-muted" : "text-muted"}`}>{intro}</p>
    </>
  );
  return (
    <section data-section={id} className={dark ? "on-dark" : "bg-ground"}>
      {pin ? (
        <div data-pin className="relative h-[260vh]">
          <div data-stage={id} className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col justify-center overflow-hidden px-5 md:px-10">
            <div className="mx-auto w-full max-w-5xl">{head}{children}</div>
          </div>
        </div>
      ) : (
        <div data-stage={id} className="px-5 py-20 md:px-10 md:py-28">
          <div className="mx-auto max-w-5xl">{head}{children}</div>
        </div>
      )}
      {after && <div className="px-5 pb-20 md:px-10 md:pb-28"><div className="mx-auto max-w-5xl">{after}</div></div>}
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
          <li key={a} data-chip={a} data-live-chip={live && s ? "" : undefined}
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
    <div className="rounded-lg border border-[#22324f] p-5 md:p-7">
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
