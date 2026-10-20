import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

// POST {mode: "login" | "register", email, password} -> lưu JWT vào cookie httpOnly
export async function POST(req: NextRequest) {
  const { mode, email, password } = await req.json();
  const res =
    mode === "register"
      ? await fetch(`${BACKEND}/auth/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
      : await fetch(`${BACKEND}/auth/login`, {
          method: "POST",
          body: new URLSearchParams({ username: email ?? "", password: password ?? "" }),
        });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json(data, { status: res.status });

  const out = NextResponse.json({ ok: true });
  out.cookies.set("token", data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60, // khớp TOKEN_TTL của backend
  });
  return out;
}

export async function DELETE() {
  const out = NextResponse.json({ ok: true });
  out.cookies.delete("token");
  return out;
}
