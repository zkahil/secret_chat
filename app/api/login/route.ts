import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { envUsers, seedUsers, signSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const name = String(username || "").trim().toLowerCase();
  await seedUsers();
  const allowed = envUsers().some((u) => u.username === name);
  const rows = allowed ? await sql`SELECT id, password_hash FROM users WHERE username=${name}` : [];
  if (!rows.length || !bcrypt.compareSync(String(password || ""), rows[0].password_hash)) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("s", await signSession(rows[0].id), {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
