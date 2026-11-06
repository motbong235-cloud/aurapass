# AuraPass — Telegram Mini App (Premium Accounts)

Digital premium store (CapCut, Spotify, Netflix, …) for Telegram WebApp.

## Deploy (Render)
1. Connect this repo · plan **Starter**
2. Set env:
   - `ADMIN_PASSWORD` — strong password
   - `BOT_TOKEN` — optional (Telegram user verify)
   - `DATA_DIR=/var/data` + disk mount
3. Open Mini App URL in BotFather → Menu Button / Web App
4. Admin: `https://YOUR.onrender.com/admin`

## Local
```bash
npm install
ADMIN_PASSWORD=changeme npm start
```
- Shop: http://localhost:3000/
- Admin: http://localhost:3000/admin
