import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;
// connexion paresseuse : le build ne plante pas sans DATABASE_URL
export const sql = ((s: TemplateStringsArray, ...v: any[]) =>
  (_sql ??= neon(process.env.DATABASE_URL!))(s, ...v)) as NeonQueryFunction<false, false>;

let ready: Promise<void> | null = null;
export function init() {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, last_seen TIMESTAMPTZ)`;
      await sql`CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INT NOT NULL,
        data BYTEA NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`;
      await sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS b64 TEXT`;
      await sql`ALTER TABLE files ALTER COLUMN data DROP NOT NULL`;
      await sql`CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INT NOT NULL REFERENCES users(id),
        receiver_id INT NOT NULL REFERENCES users(id),
        body TEXT, file_id INT REFERENCES files(id),
        kind TEXT NOT NULL DEFAULT 'text',
        created_at TIMESTAMPTZ DEFAULT now(), read_at TIMESTAMPTZ)`;
      await sql`CREATE INDEX IF NOT EXISTS msg_pair ON messages (sender_id, receiver_id, id)`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}