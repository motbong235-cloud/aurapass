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

## Auto payment (ABA PayWay)

Set on Render:
```
ABA_API_KEY=your_khmer_system_or_profile_key
ABA_MACHINE_ID=optional_machine_id
```
When set: QR is created per order, payment is checked every 12s + when user taps「ខ្ញុំបានបង់ហើយ」.
On paid → **auto approve** → **auto delivery** from stock (if product delivery = auto).

Without keys: static KHQR image from Admin Settings + **manual approve** in Admin → Payments.

## Auto delivery
- Product **delivery = auto** + stock lines (`email:password`) → credentials sent on pay success.
- Product **delivery = manual** → order stays `processing` until Admin delivers.
