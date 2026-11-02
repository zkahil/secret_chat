import { NextResponse } from "next/server";
import { sql, init } from "@/lib/db";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
const MAX = 4 * 1024 * 1024; // limite Vercel ~4,5 Mo par requête

export async function GET(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await init();
  const u = new URL(req.url).searchParams;
  const w = Number(u.get("with"));
  const after = Number(u.get("after") || 0);
  if (!w) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const messages = await sql`
    SELECT m.id, m.sender_id, m.body, m.kind, m.created_at, m.file_id,
           f.name AS file_name, f.mime AS file_mime, f.size AS file_size
    FROM messages m LEFT JOIN files f ON f.id=m.file_id
    WHERE ((m.sender_id=${uid} AND m.receiver_id=${w}) OR (m.sender_id=${w} AND m.receiver_id=${uid}))
      AND m.id>${after}
    ORDER BY m.id LIMIT 200`;
  await sql`UPDATE messages SET read_at=now() WHERE sender_id=${w} AND receiver_id=${uid} AND read_at IS NULL`;
  const r = await sql`SELECT coalesce(max(id),0)::int AS r FROM messages
    WHERE sender_id=${uid} AND receiver_id=${w} AND read_at IS NOT NULL`;
  const ids = (await sql`SELECT id FROM messages
    WHERE (sender_id=${uid} AND receiver_id=${w}) OR (sender_id=${w} AND receiver_id=${uid})`).map((x) => x.id as number);
  return NextResponse.json({ messages, readUpTo: r[0].r, ids });
}

export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await init();
  const fd = await req.formData();
  const to = Number(fd.get("to"));
  const body = String(fd.get("body") || "").trim();
  const file = fd.get("file") as (Blob & { name?: string }) | string | null;
  if (!to || to === uid || !(await sql`SELECT 1 FROM users WHERE id=${to}`).length)
    return NextResponse.json({ error: "destinataire invalide" }, { status: 400 });

  let fileId: number | null = null;
  let kind = "text";
  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > MAX) return NextResponse.json({ error: "Fichier trop gros (max 4 Mo)" }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    kind = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio"
      : mime.startsWith("video/") ? "video" : "file";
    const f = await sql`INSERT INTO files (name, mime, size, b64)
      VALUES (${file.name || "fichier"}, ${mime}, ${buf.length}, ${buf.toString("base64")}) RETURNING id`;
    fileId = f[0].id;
  } else if (!body) {
    return NextResponse.json({ error: "message vide" }, { status: 400 });
  }
  const m = await sql`INSERT INTO messages (sender_id, receiver_id, body, file_id, kind)
    VALUES (${uid}, ${to}, ${body || null}, ${fileId}, ${kind}) RETURNING id`;
  return NextResponse.json({ ok: true, id: m[0].id });
}

export async function DELETE(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  const m = await sql`DELETE FROM messages WHERE id=${id} AND sender_id=${uid} RETURNING file_id`;
  if (m[0]?.file_id) await sql`DELETE FROM files WHERE id=${m[0].file_id}`;
  return NextResponse.json({ ok: true });
}