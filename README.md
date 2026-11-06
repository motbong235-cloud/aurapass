# Zen Premium — Telegram Mini App + Bot

## Render env (required for bot)
| Key | Example |
|-----|---------|
| `BOT_TOKEN` | from @BotFather |
| `WEBAPP_URL` | `https://YOUR-SERVICE.onrender.com` |
| `ADMIN_PASSWORD` | strong password for `/admin` |
| `DATA_DIR` | `/var/data` |
| `ADMIN_ID` | optional Telegram user id |

## BotFather
1. `/newbot` → Zen Premium / `ZenPremiumStoreBot`
2. Paste token → Render `BOT_TOKEN`
3. `/setmenubutton` → Web App URL = same as `WEBAPP_URL`
4. Open bot → `/start` → button **បើក Zen Premium**

Only **one** Render instance should run (409 if two poll same token).
