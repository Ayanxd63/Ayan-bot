/**
 * Central configuration for AYAN XD.
 * Values are getters so changes made at runtime via .setvar apply instantly.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

require('dotenv').config();

const VARS_FILE = path.join(__dirname, 'data', 'vars.json');

// Overlay runtime variables (set with .setvar) on top of .env
try {
  if (fs.existsSync(VARS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(VARS_FILE, 'utf8'));
    for (const [k, v] of Object.entries(saved)) process.env[k] = String(v);
  }
} catch (e) {
  console.error('Could not read data/vars.json:', e.message);
}

const env = (key, fallback) => process.env[key] ?? fallback;
const digits = (s) => String(s).replace(/\D/g, '');

module.exports = {
  VARS_FILE,
  VERSION: '6.2.0',

  get BOT_NAME() { return env('BOT_NAME', 'AYAN XD'); },
  get PREFIX() { return env('PREFIX', '.'); },
  get OWNER_NAME() { return env('OWNER_NAME', 'Miss Mano'); },
  get OWNER_NUMBER() { return digits(env('OWNER_NUMBER', '923XXXXXXXXX')); },
  get SUDO() { return env('SUDO', '').split(',').map(digits).filter(Boolean); },
  get WORK_TYPE() { return env('WORK_TYPE', 'public').toLowerCase(); }, // "public" | "private"
  get TIMEZONE() { return env('TIMEZONE', 'Asia/Karachi'); },
  get PORT() { return Number(env('PORT', env('SERVER_PORT', 3000))); },

  // ---- Dynamic system stats ----
  getRam() {
    const used = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const total = Math.round(os.totalmem() / 1024 / 1024);
    return { used, total };
  },
  getUptime() {
    let s = Math.floor(os.uptime()); // server uptime
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    return `${d ? d + 'd ' : ''}${h}h ${m}m ${s}s`;
  },
  getPlatform() { return os.platform(); },
  getPluginCount() { return require('./lib/plugins').count(); },
};
