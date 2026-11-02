"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Contact = { id: number; username: string; last_seen: string | null; unread: number;
  last: { body: string | null; kind: string; created_at: string; sender_id: number } | null };
type Msg = { id: number; sender_id: number; body: string | null; kind: string; created_at: string;
  file_id: number | null; file_name: string | null; file_mime: string | null; file_size: number | null };

const MAX = 4 * 1024 * 1024;
const hhmm = (d: string) => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const day = (d: string) => new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const size = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko");
const preview = (c: Contact) => {
  if (!c.last) return "Aucun message";
  const you = c.last.sender_id !== c.id ? "Vous : " : "";
  const t = { image: "📷 Photo", audio: "🎤 Message vocal", video: "🎬 Vidéo", file: "📎 Fichier" }[c.last.kind];
  return you + (t || c.last.body || "");
};
const online = (c: Contact) => !!c.last_seen && Date.now() - new Date(c.last_seen).getTime() < 15000;

const EMOJIS = "😀 😂 🥹 😍 😘 😎 🤔 😅 😭 😡 🥳 😴 🙄 😉 🤗 😇 🤩 😢 😮 🙏 👍 👎 👏 🙌 💪 🤝 👋 ✌️ 🤞 ❤️ 💔 🔥 ✨ 🎉 💯 ✅ ❌ ⭐ 🌹 ☕ 🍕 🎂 🚗 🏠 📞 💻".split(" ");

// Lecteur vocal 100 % dans l'app : décode l'audio avec Web Audio (pas de <audio>, pas de téléchargement)
function Voice({ src }: { src: string; name?: string }) {
  const ctx = useRef<AudioContext | null>(null);
  const buf = useRef<AudioBuffer | null>(null);
  const node = useRef<AudioBufferSourceNode | null>(null);
  const off = useRef(0);
  const began = useRef(0);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [fb, setFb] = useState("");
  const [info, setInfo] = useState("");
  const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;

  const stop = () => {
    const n = node.current;
    if (n) { n.onended = null; try { n.stop(); } catch {} n.disconnect(); node.current = null; }
  };
  const play = (from = off.current) => {
    const c = ctx.current, b = buf.current;
    if (!c || !b) return;
    stop();
    c.resume();
    const n = c.createBufferSource();
    n.buffer = b;
    n.connect(c.destination);
    n.onended = () => { node.current = null; off.current = 0; setPlaying(false); setT(0); };
    off.current = from;
    began.current = c.currentTime - from;
    n.start(0, from);
    node.current = n;
    setPlaying(true);
  };
  const pause = () => {
    if (ctx.current) off.current = ctx.current.currentTime - began.current;
    stop();
    setPlaying(false);
  };
  const seek = (v: number) => { off.current = v; setT(v); if (playing) play(v); };

  useEffect(() => {
    let dead = false, blobUrl = "";
    const c = new (window.AudioContext || (window as any).webkitAudioContext)();
    ctx.current = c;
    fetch(src)
      .then(async (r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        const ab = await r.arrayBuffer();
        const len = ab.byteLength;
        if (!len) throw new Error("fichier vide");
        const copy = ab.slice(0);
        try {
          const b = await c.decodeAudioData(ab);
          if (dead) return;
          buf.current = b; setDur(b.duration); setReady(true);
        } catch {
          if (dead) return;
          const head = Array.from(new Uint8Array(copy.slice(0, 4))).map((x) => x.toString(16).padStart(2, "0")).join("");
          setInfo(`${len} o, ${r.headers.get("content-type")}, ${head}`);
          blobUrl = URL.createObjectURL(new Blob([copy], { type: r.headers.get("content-type") || "audio/webm" }));
          setFb(blobUrl);
        }
      })
      .catch((e) => !dead && setErr(e?.message || "erreur"));
    return () => { dead = true; stop(); c.close(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [src]);

  useEffect(() => {
    if (!playing) return;
    const i = setInterval(() => ctx.current && setT(Math.min(dur, ctx.current.currentTime - began.current)), 100);
    return () => clearInterval(i);
  }, [playing, dur]);

  if (err) return <small className="verr">Lecture impossible ({err})</small>;
  if (fb) return <audio controls src={fb} onError={() => { setFb(""); setErr("illisible : " + info); }} />;
  return (
    <div className="voice">
      <button disabled={!ready} onClick={() => (playing ? pause() : play())}>{playing ? "⏸" : "▶"}</button>
      <input type="range" min={0} max={dur || 1} step={0.1} value={Math.min(t, dur || 1)}
        onChange={(e) => seek(+e.target.value)} disabled={!ready} />
      <small>{ready ? fmt(playing || t ? t : dur) : "…"}</small>
    </div>
  );
}

// Encode l'audio micro en WAV mono 16 kHz : lisible partout, sans codec
function encodeWav(chunks: Float32Array[], inRate: number) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const all = new Float32Array(n);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  const outRate = 16000, ratio = inRate / outRate, len = Math.floor(n / ratio);
  const buf = new ArrayBuffer(44 + len * 2);
  const dv = new DataView(buf);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  w(0, "RIFF"); dv.setUint32(4, 36 + len * 2, true); w(8, "WAVE"); w(12, "fmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true); dv.setUint32(28, outRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) {
    const pos = i * ratio, i0 = Math.floor(pos), f = pos - i0;
    const v = all[i0] * (1 - f) + (all[i0 + 1] ?? all[i0]) * f;
    dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export default function Chat() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: number; username: string } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState<Contact | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [readUpTo, setReadUpTo] = useState(0);
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [rec, setRec] = useState<{ stop: () => void; cancel: () => void; start: number } | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [level, setLevel] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  const photoIn = useRef<HTMLInputElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const lastId = useRef(0);
  const activeId = useRef(0);

  const loadMe = useCallback(async () => {
    const r = await fetch("/api/me");
    if (r.status === 401) return router.replace("/login");
    const d = await r.json();
    setMe(d.me);
    setContacts(d.contacts);
    setActive((a) => (a ? d.contacts.find((c: Contact) => c.id === a.id) || a : a));
  }, [router]);

  const loadMsgs = useCallback(async () => {
    const w = activeId.current;
    if (!w) return;
    const r = await fetch(`/api/messages?with=${w}&after=${lastId.current}`);
    if (!r.ok || w !== activeId.current) return;
    const d = await r.json();
    setReadUpTo(d.readUpTo);
    const ids = new Set<number>(d.ids);
    if (d.messages.length) lastId.current = d.messages[d.messages.length - 1].id;
    setMsgs((p) => {
      const kept = p.filter((m) => ids.has(m.id));
      return d.messages.length || kept.length !== p.length ? [...kept, ...d.messages] : p;
    });
  }, []);

  useEffect(() => { loadMe(); const t = setInterval(loadMe, 4000); return () => clearInterval(t); }, [loadMe]);
  useEffect(() => { const t = setInterval(loadMsgs, 2000); return () => clearInterval(t); }, [loadMsgs]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length, active?.id]);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const n = Math.floor((Date.now() - rec.start) / 1000);
      setSecs(n);
      if (n >= 110) { rec.stop(); setRec(null); } // ~3,5 Mo max
    }, 250);
    return () => clearInterval(t);
  }, [rec]);

  function open(c: Contact) {
    activeId.current = c.id; lastId.current = 0;
    setActive(c); setMsgs([]); setReadUpTo(0); setError(""); setMenu(false);
    loadMsgs();
  }

  async function send(file?: File, body = text) {
    if (!active || sending || (!file && !body.trim())) return;
    if (file && file.size > MAX) return setError("Fichier trop gros (max 4 Mo)");
    setSending(true); setError("");
    const fd = new FormData();
    fd.set("to", String(active.id));
    fd.set("body", body);
    if (file) fd.set("file", file);
    const r = await fetch("/api/messages", { method: "POST", body: fd });
    if (r.ok) { setText(""); await loadMsgs(); loadMe(); }
    else setError((await r.json().catch(() => ({}))).error || "Échec de l'envoi");
    setSending(false); setMenu(false);
  }

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      await ctx.resume();
      const input = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      const chunks: Float32Array[] = [];
      let peak = 0, cancelled = false;
      const t0 = Date.now();
      proc.onaudioprocess = (e) => {
        const d = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(d));
        let m = 0;
        for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
        peak = Math.max(peak, m);
        setLevel(m);
      };
      input.connect(proc); proc.connect(mute); mute.connect(ctx.destination);

      const finish = () => {
        proc.onaudioprocess = null;
        input.disconnect(); proc.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        const rate = ctx.sampleRate;
        ctx.close();
        setLevel(0);
        if (cancelled) return;
        const secs = Math.round((Date.now() - t0) / 1000);
        if (!chunks.length || secs < 1) return setError("Enregistrement trop court");
        if (peak < 0.01) return setError("Micro silencieux : choisis le bon micro dans le navigateur (icône à gauche de l'adresse) ou dans les réglages son du système");
        send(new File([encodeWav(chunks, rate)], `vocal-${secs}s-${Date.now()}.wav`, { type: "audio/wav" }), "");
      };
      setSecs(0);
      setRec({ stop: finish, cancel: () => { cancelled = true; finish(); }, start: t0 });
    } catch { setError("Micro inaccessible : autorise-le dans le navigateur"); }
  }
  const stopRec = () => { rec?.stop(); setRec(null); };
  const cancelRec = () => { rec?.cancel(); setRec(null); };

  async function del(id: number) {
    if (!confirm("Supprimer ce message ?")) return;
    setMsgs((p) => p.filter((m) => m.id !== id));
    await fetch(`/api/messages?id=${id}`, { method: "DELETE" });
    loadMe();
  }

  async function logout() { await fetch("/api/logout", { method: "POST" }); router.replace("/login"); }

  function bubble(m: Msg) {
    const url = m.file_id ? `/api/files/${m.file_id}` : "";
    return (
      <>
        {m.kind === "image" && <img src={url} alt={m.file_name || ""} loading="lazy" onClick={() => setLightbox(url)} />}
        {m.kind === "video" && <video src={url} controls preload="metadata" />}
        {m.kind === "audio" && <Voice src={url} name={m.file_name || ""} />}
        {m.kind === "file" && (
          <a className="doc" href={url} download={m.file_name || "fichier"}>
            <span>📄</span><div><b>{m.file_name}</b><small>{size(m.file_size || 0)}</small></div>
          </a>
        )}
        {m.body && <p>{m.body}</p>}
      </>
    );
  }

  if (!me) return <div className="boot">Chargement…</div>;

  return (
    <div className={"app" + (active ? " in-chat" : "")}>
      <aside>
        <header>
          <div className="avatar">{me.username[0].toUpperCase()}</div>
          <b>{me.username}</b>
          <button className="ghost" onClick={logout} title="Déconnexion">⎋</button>
        </header>
        <ul>
          {contacts.map((c) => (
            <li key={c.id} className={active?.id === c.id ? "on" : ""} onClick={() => open(c)}>
              <div className="avatar">{c.username[0].toUpperCase()}{online(c) && <i />}</div>
              <div className="meta">
                <div><b>{c.username}</b>{c.last && <time>{hhmm(c.last.created_at)}</time>}</div>
                <div><span>{preview(c)}</span>{c.unread > 0 && <em>{c.unread}</em>}</div>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        {!active ? (
          <div className="empty"><div className="logo">🔒</div><h2>Chat privé</h2><p>Choisissez une conversation.</p></div>
        ) : (
          <>
            <header>
              <button className="ghost back" onClick={() => { activeId.current = 0; setActive(null); }}>←</button>
              <div className="avatar">{active.username[0].toUpperCase()}</div>
              <div><b>{active.username}</b><small>{online(active) ? "en ligne" : active.last_seen ? "vu à " + hhmm(active.last_seen) : ""}</small></div>
            </header>

            <div className="msgs" onClick={() => { setMenu(false); setEmoji(false); }}>
              {msgs.map((m, i) => {
                const mine = m.sender_id === me.id;
                const newDay = i === 0 || day(msgs[i - 1].created_at) !== day(m.created_at);
                return (
                  <div key={m.id} style={{ display: "contents" }}>
                    {newDay && <div className="day"><span>{day(m.created_at)}</span></div>}
                    <div className={"bub " + (mine ? "me" : "you")}>
                      {mine && <button className="del" onClick={() => del(m.id)} title="Supprimer">🗑</button>}
                      {bubble(m)}
                      <time>{hhmm(m.created_at)}{mine && <b className={m.id <= readUpTo ? "read" : ""}> ✓✓</b>}</time>
                    </div>
                  </div>
                );
              })}
              <div ref={bottom} />
            </div>

            {error && <div className="toast" onClick={() => setError("")}>{error}</div>}

            <footer>
              {rec ? (
                <>
                  <button className="ghost" onClick={cancelRec} title="Annuler">🗑</button>
                  <div className="recbar"><i /><span className="lvl"><b style={{ width: Math.min(100, level * 300) + "%" }} /></span>{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</div>
                  <button className="send" onClick={stopRec} title="Envoyer">➤</button>
                </>
              ) : (
                <>
                  <div className="attach">
                    <button className="ghost" onClick={() => { setEmoji(!emoji); setMenu(false); }} title="Emoji">😊</button>
                    {emoji && (
                      <div className="emojis">
                        {EMOJIS.map((e) => <button key={e} onClick={() => setText((t) => t + e)}>{e}</button>)}
                      </div>
                    )}
                  </div>
                  <div className="attach">
                    <button className="ghost" onClick={() => { setMenu(!menu); setEmoji(false); }} title="Joindre">📎</button>
                    {menu && (
                      <div className="menu">
                        <button onClick={() => photoIn.current?.click()}>🖼 Photo / vidéo</button>
                        <button onClick={() => fileIn.current?.click()}>📄 Document</button>
                      </div>
                    )}
                  </div>
                  <input ref={photoIn} type="file" accept="image/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; f && send(f, text); }} />
                  <input ref={fileIn} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; f && send(f, text); }} />
                  <input className="txt" placeholder="Écrire un message" value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())} />
                  {text.trim()
                    ? <button className="send" onClick={() => send()} disabled={sending}>➤</button>
                    : <button className="send" onClick={startRec} disabled={sending} title="Message vocal">🎤</button>}
                </>
              )}
            </footer>
          </>
        )}
      </section>

      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="" /></div>}
    </div>
  );
}