"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const r = useRouter();
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) r.replace("/chat");
    else { setErr((await res.json().catch(() => ({}))).error || "Erreur"); setBusy(false); }
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <div className="logo">🔒</div>
        <h1>Chat privé</h1>
        <input placeholder="Nom" autoCapitalize="none" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} />
        <input placeholder="Mot de passe" type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button disabled={busy || !username || !password}>{busy ? "Connexion…" : "Se connecter"}</button>
      </form>
    </main>
  );
}
