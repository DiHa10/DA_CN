// Một mục dạng settings: cột tiêu đề + mô tả bên trái, khung thao tác bên phải; xếp chồng trên điện thoại
export function SectionRow({ title, description, children }: {
  title: string; description: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-border py-8 first:border-t-0 first:pt-2 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="heading">{title}</h2>
        <div className="mt-1 space-y-2 text-sm text-muted">{description}</div>
      </div>
      <div className="max-w-2xl rounded-lg bg-raised p-5">{children}</div>
    </section>
  );
}

export function StatusLine({ status }: { status: { ok: boolean; text: string } | null }) {
  if (!status) return null;
  return (
    <p role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "text-positive" : "text-negative"}`}>
      {status.text}
    </p>
  );
}
