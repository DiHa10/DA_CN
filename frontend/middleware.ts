import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  if (!req.cookies.get("token")) return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/", "/dashboard/:path*", "/reviews/:path*", "/import/:path*", "/stores/:path*", "/compare/:path*"] };
