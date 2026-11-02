import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { sql, init } from "./db";

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET!);

export async function signSession(uid: number) {
  return new SignJWT({ uid }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(key());
}

export async function getUid(): Promise<number | null> {
  const t = cookies().get("s")?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    return payload.uid as number;
  } catch {
    return null;
  }
}

export function envUsers() {
  return (process.env.USERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((s) => {
      const i = s.indexOf(":");
      return { username: s.slice(0, i).toLowerCase(), password: s.slice(i + 1) };
    });
}

/** Crée / met à jour les 3 comptes définis dans USERS. */
export async function seedUsers() {
  await init();
  for (const u of envUsers()) {
    const rows = await sql`SELECT id, password_hash FROM users WHERE username=${u.username}`;
    if (!rows.length) {
      await sql`INSERT INTO users (username, password_hash) VALUES (${u.username}, ${bcrypt.hashSync(u.password, 10)})`;
    } else if (!bcrypt.compareSync(u.password, rows[0].password_hash)) {
      await sql`UPDATE users SET password_hash=${bcrypt.hashSync(u.password, 10)} WHERE id=${rows[0].id}`;
    }
  }
}
