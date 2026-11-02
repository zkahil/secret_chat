import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (p === "/login" || p === "/api/login") return NextResponse.next();
  try {
    await jwtVerify(req.cookies.get("s")?.value || "", new TextEncoder().encode(process.env.AUTH_SECRET!));
    return NextResponse.next();
  } catch {
    if (p.startsWith("/api")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = { matcher: ["/((?!_next|favicon.ico|robots.txt).*)"] };
