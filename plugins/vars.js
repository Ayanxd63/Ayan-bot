/**
 * Runtime variable manager (owner only). Persists to data/vars.json and applies instantly.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const BLOCKED = new Set(['PATH', 'NODE_OPTIONS', 'LD_PRELOAD', 'HOME', 'SHELL']);
const SECRET = /KEY|TOKEN|SECRET|URI|SESSION|PASSWORD/i;
const mask = (k, v) => (SECRET.test(k) ? String(v).slice(0, 4) + '****' : v);

const readSaved = () => { try { return JSON.parse(fs.readFileSync(config.VARS_FILE, 'utf8')); } catch { return {}; } };
const writeSaved = (o) => {
  fs.mkdirSync(path.dirname(config.VARS_FILE), { recursive: true });
  fs.writeFileSync(config.VARS_FILE, JSON.stringify(o, null, 2));
};
const ownerOnly = (fn) => async (conn, mek, m, ctx) => (ctx.isOwner ? fn(conn, mek, m, ctx) : ctx.reply('⛔ Owner only.'));
const base = { category: 'vars', filename: __filename };

module.exports = [
  { ...base, pattern: 'setvar', desc: 'Set a variable', use: 'KEY=VALUE',
    execute: ownerOnly(async (conn, mek, m, { q, reply }) => {
      const match = q.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*[= ]\s*([\s\S]+)$/);
      if (!match) return reply('Usage: .setvar KEY=VALUE');
      const key = match[1].toUpperCase(), value = match[2].trim();
      if (BLOCKED.has(key)) return reply('🚫 That variable is protected.');
      process.env[key] = value;
      writeSaved({ ...readSaved(), [key]: value });
      reply(`✅ ${key} = ${mask(key, value)}${SECRET.test(key) ? '\n(Delete your message — it contains a secret.)' : ''}`);
    }) },
  { ...base, pattern: 'getvar', desc: 'Get a variable', use: 'KEY',
    execute: ownerOnly(async (conn, mek, m, { args, reply }) => {
      const key = (args[0] || '').toUpperCase();
      if (!key) return reply('Usage: .getvar KEY');
      reply(process.env[key] === undefined ? `❔ ${key} is not set.` : `${key} = ${mask(key, process.env[key])}`);
    }) },
  { ...base, pattern: 'delvar', desc: 'Delete a saved variable', use: 'KEY',
    execute: ownerOnly(async (conn, mek, m, { args, reply }) => {
      const key = (args[0] || '').toUpperCase();
      if (!key) return reply('Usage: .delvar KEY');
      const saved = readSaved(); delete saved[key]; writeSaved(saved); delete process.env[key];
      reply(`🗑️ ${key} removed.`);
    }) },
  { ...base, pattern: 'allvar', desc: 'List saved variables', use: '',
    execute: ownerOnly(async (conn, mek, m, { reply }) => {
      const entries = Object.entries(readSaved());
      reply(entries.length ? entries.map(([k, v]) => `• ${k} = ${mask(k, v)}`).join('\n') : 'No saved variables.');
    }) },
];
