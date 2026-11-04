// "AI đang đọc..." với ba chấm nhấp nháy lần lượt: việc chạy lâu (tới nửa phút) vẫn thấy đang chạy, không như bị treo
export function Busy({ text }: { text: string }) {
  return (
    <>
      {text}
      <span className="dots" aria-hidden><span>.</span><span>.</span><span>.</span></span>
    </>
  );
}
