import type { Sentiment } from "@/lib/api";
import { SENTIMENT_COLOR, SENTIMENT_LABEL, SENTIMENT_PILL } from "@/lib/labels";

// Pill cảm xúc tổng thể: mỗi dòng một pill
export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return (
    <span className={`inline-flex h-5 flex-none items-center rounded px-1.5 text-xs font-medium whitespace-nowrap ${SENTIMENT_PILL[sentiment]}`}>
      {SENTIMENT_LABEL[sentiment]}
    </span>
  );
}

// Khía cạnh: chip xám, chấm màu cho cảm xúc, chữ nói rõ để không chỉ dựa vào màu
export function AspectChip({ label, sentiment, corrected }: { label: string; sentiment: Sentiment; corrected?: boolean }) {
  return (
    <span className="inline-flex flex-none items-center gap-1.5 text-xs whitespace-nowrap text-muted">
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: SENTIMENT_COLOR[sentiment] }} />
      {/* nhãn người sửa: gạch chân chấm, để phân biệt với nhãn máy đoán */}
      <span className={corrected ? "underline decoration-dotted underline-offset-2" : ""} title={corrected ? "Nhãn đã được sửa tay" : undefined}>{label}</span>
      <span className="sr-only">: {SENTIMENT_LABEL[sentiment]}{corrected && " (đã sửa tay)"}</span>
    </span>
  );
}
