"use client";

import { StatusLine } from "@/components/section-row";
import { api, json, type Member, type Role, type Store } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/labels";
import { useEffect, useState } from "react";

type Status = { ok: boolean; text: string } | null;
const ROLES: Role[] = ["owner", "manager", "staff"];

// Thành viên của quán: thêm người đã có tài khoản theo email, đổi vai trò, xóa. Chỉ owner thấy.
export function MembersSettings({ store }: { store: Store }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [status, setStatus] = useState<Status>(null);
  const base = `/stores/${store.id}/members`;

  useEffect(() => {
    api<Member[]>(base).then(setMembers, (e) => setStatus({ ok: false, text: e.message }));
  }, [base]);

  async function run(fn: () => Promise<Member[]>, done: string) {
    setStatus(null);
    try {
      setMembers(await fn());
      setStatus({ ok: true, text: done });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api<Member[]>(base, json("POST", { email: email.trim(), role })), `Đã thêm ${email.trim()}.`).then(() => setEmail(""));
  };

  return (
    <div className="space-y-4">
      {!members ? (
        <p className="text-sm text-muted">Đang tải…</p>
      ) : (
        <ul className="divide-y divide-border rounded-md bg-surface">
          {members.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
              <label htmlFor={`role-${m.user_id}`} className="sr-only">Vai trò của {m.email}</label>
              <select id={`role-${m.user_id}`} className="control" value={m.role}
                onChange={(e) => run(() => api<Member[]>(`${base}/${m.user_id}`, json("PATCH", { role: e.target.value })),
                  `Đã đổi vai trò của ${m.email}.`)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <button className="tap cursor-pointer text-sm font-medium text-negative hover:underline"
                onClick={() => confirm(`Xóa ${m.email} khỏi ${store.name}?`) &&
                  run(() => api<Member[]>(`${base}/${m.user_id}`, { method: "DELETE" }), `Đã xóa ${m.email}.`)}>
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <label htmlFor={`member-email-${store.id}`} className="label">Thêm theo email</label>
          <input id={`member-email-${store.id}`} type="email" required maxLength={255} className="input"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`member-role-${store.id}`} className="label">Vai trò</label>
          <select id={`member-role-${store.id}`} className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <button className="btn">Thêm</button>
      </form>
      <StatusLine status={status} />
    </div>
  );
}
