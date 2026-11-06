# Zen Premium — Telegram Mini App

Digital premium accounts store (CapCut, Spotify, Netflix, …) for Telegram WebApp.

## Deploy (Render)
1. Connect repo · plan **Starter**
2. Env:
   - `ADMIN_PASSWORD` — strong password
   - `DATA_DIR=/var/data` + disk
   - Optional auto-pay: `ABA_API_KEY`, `ABA_MACHINE_ID`
3. Mini App URL in BotFather
4. Admin: `https://YOUR.onrender.com/admin`

## Local
```bash
npm install
ADMIN_PASSWORD=changeme npm start
```
