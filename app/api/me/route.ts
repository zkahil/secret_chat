import { NextResponse } from "next/server";
import { sql, init } from "@/lib/db";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await init();
  await sql`UPDATE users SET last_seen=now() WHERE id=${uid}`;
  const me = (await sql`SELECT id, username FROM users WHERE id=${uid}`)[0];
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const contacts = await sql`
    SELECT u.id, u.username, u.last_seen,
      (SELECT count(*) FROM messages m WHERE m.sender_id=u.id AND m.receiver_id=${uid} AND m.read_at IS NULL)::int AS unread,
      (SELECT row_to_json(l) FROM (
         SELECT body, kind, created_at, sender_id FROM messages
         WHERE (sender_id=u.id AND receiver_id=${uid}) OR (sender_id=${uid} AND receiver_id=u.id)
         ORDER BY id DESC LIMIT 1) l) AS last
    FROM users u WHERE u.id<>${uid} ORDER BY u.username`;
  return NextResponse.json({ me, contacts });
}
