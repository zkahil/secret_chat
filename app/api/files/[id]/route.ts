import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(params.id);
  const rows = await sql`
    SELECT f.name, f.mime, coalesce(f.b64, encode(f.data,'base64')) AS b64 FROM files f
    JOIN messages m ON m.file_id=f.id
    WHERE f.id=${id} AND (m.sender_id=${uid} OR m.receiver_id=${uid}) LIMIT 1`;
  if (!rows.length) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buf = Buffer.from(rows[0].b64, "base64");
  const h: Record<string, string> = {
    "Content-Type": rows[0].mime,
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(rows[0].name)}`,
    "Cache-Control": "private, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  if (m) {
    const s = m[1] ? +m[1] : 0;
    const e = m[2] ? Math.min(+m[2], buf.length - 1) : buf.length - 1;
    return new Response(buf.subarray(s, e + 1) as unknown as BodyInit, {
      status: 206,
      headers: { ...h, "Content-Range": `bytes ${s}-${e}/${buf.length}`, "Content-Length": String(e - s + 1) },
    });
  }
  return new Response(buf as unknown as BodyInit, { headers: h });
}