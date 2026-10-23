# 🤖 AYAN XD — Modular WhatsApp Bot

Node.js 18+ bot on [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) with a drop-in plugin system.

## Quick start
```bash
npm install
cp .env.example .env     # set OWNER_NUMBER, SUDO, keys
npm start
```
First run: choose **[1] QR** or **[2] Pairing code** (`XXXX-XXXX` → WhatsApp › Linked devices › Link with phone number). Set `PAIR_NUMBER` to skip the prompt. **ffmpeg** must be installed for stickers (the Dockerfile does it).

## Session storage
| Method | How |
|---|---|
| Local | default, `./session` |
| Base64 | `npm run session:export` → `SESSION_ID` (restores creds only) |
| MongoDB | `MONGODB_URI` (recommended on Heroku/Koyeb/Render) |

Reconnect: backoff on 408/428/500/503, instant on 515, session wipe on 401, exit on 440/403 (PM2/Docker restarts).

## Commands (all 47 from your menu, plus extras)
| Category | Commands | Needs |
|---|---|---|
| AI | `gpt` `gemini` `groq` `or` `dall` `bing` `upscale` | `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `REPLICATE_API_TOKEN`. `bing` is keyless (Pollinations image generation). |
| Download | `song/play` `yta` `ytv` `tiktok` `fb` `insta` `mediafire` `apk` `spotify` | `fb`/`insta`: `COBALT_API` (self-hosted [cobalt](https://github.com/imputnet/cobalt)). `spotify`: `SPOTIFY_CLIENT_ID/SECRET`. Others keyless. |
| Group | `add` `kick` `promote` `demote` `invite` `mute` `unmute` `tagall` `warn` `inactives` + `antilink` `welcome` | none |
| Misc | `alive` `ping` `reboot` `afk` `calc` `fancy` `tts` `url` `rmbg` | `rmbg`: `REMOVEBG_API_KEY` |
| Sticker | `sticker` `photo` `circle` `take` `exif` `tg` | `tg`: `TELEGRAM_BOT_TOKEN` |
| Vars | `setvar` `getvar` `delvar` `allvar` | owner only |

Commands without their key reply with a clear "set X first" message instead of crashing. Set keys in `.env` or live with `.setvar KEY=value`.

## Data
AFK, warnings, antilink/welcome settings and activity are stored in **MongoDB** when `MONGODB_URI` is set (same database as the session, collection `bot_data`), so they survive redeploys. Without it they fall back to `data/db.json`. An existing `db.json` is migrated into Mongo automatically on first start. Data is saved every few seconds and on shutdown/`.reboot`.

## Deploy
- **Docker / Koyeb / Render:** use the `Dockerfile` (ffmpeg included, runs under pm2-runtime).
- **Heroku:** `Procfile` + ffmpeg buildpack.
- **VPS:** `npm run pm2 && pm2 save && pm2 startup`.

## Writing a plugin
```js
module.exports = {
  pattern: 'hello', alias: ['hi'], category: 'misc', desc: 'Say hello', use: '', filename: __filename,
  async execute(conn, mek, m, { args, q, isOwner, isGroup, reply }) { await reply(`Hello ${m.pushName}!`); },
};
```
A file may export an array of plugins. Extra helpers: `isSudo isAdmin isBotAdmin participants from sender prefix`; `m.media.download()` (attached/replied media), `m.quoted`, `m.mentioned`.

## Notes
- Downloaders rely on third-party services (tikwm, Aptoide, YouTube) that change without notice; update `@distube/ytdl-core` if YouTube breaks.
- Baileys is unofficial: use a secondary number; bans are possible.
- If admin/owner checks fail because WhatsApp sends `@lid` IDs, add the number to `SUDO`.

## Free panel hosting (OptikLink, Bot-Hosting.net, etc. — Pterodactyl panels)
1. Create a **Node.js** server (Node 18+; 20 recommended).
2. Upload the zip, extract it so `index.js` is in the server's root.
3. Startup file: `index.js`. Run `npm install` (from the console or via the panel's auto-install).
4. Environment/`.env`: `OWNER_NUMBER`, `SUDO`, `PAIR_NUMBER=<your number>` (panel consoles have no prompt, so this gives a pairing code in the logs), and `MONGODB_URI` (free MongoDB Atlas) if the panel disk is reset.
5. Start. Copy the pairing code from the console into WhatsApp › Linked devices › Link with phone number.
Stickers work without a system ffmpeg (bundled `ffmpeg-static`). Free panels often require periodic renewals/“keep alive”, so check your panel's rules.
