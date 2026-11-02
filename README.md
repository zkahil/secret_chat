# Chat privé (Next.js + Neon)

1. `cp .env.example .env.local` puis remplir DATABASE_URL (Neon), AUTH_SECRET, USERS (3 comptes max)
2. `npm install && npm run dev` → http://localhost:3000
3. Déploiement : Vercel, mêmes variables d'environnement. Les tables sont créées automatiquement à la première connexion.
