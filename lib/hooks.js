/**
 * Passive per-message hooks: activity tracking, AFK, antilink.
 * Returns true when the message has been consumed (no command processing).
 */
const db = require('./db');
const config = require('../config');
const { num, timeAgo } = require('./utils');

const LINK = /chat\.whatsapp\.com\/[A-Za-z0-9]{10,}/i;

async function run(conn, mek, m, ctx) {
  // 1. Activity tracking (powers .inactives)
  if (m.isGroup && !m.fromMe) {
    const rec = ((db.data.activity[m.from] ||= {})[m.number] ||= { count: 0 });
    rec.last = Date.now();
    rec.count++;
    db.save();
  }

  // 2. Antilink: delete WhatsApp group invite links from non-admins
  if (m.isGroup && db.data.groups[m.from]?.antilink && LINK.test(m.body) && !ctx.isAdmin && !ctx.isSudo && ctx.isBotAdmin) {
    await conn.sendMessage(m.from, { delete: mek.key });
    await conn.sendMessage(m.from, { text: `🚫 @${m.number} group links are not allowed here.`, mentions: [m.sender] });
    return true;
  }

  // 3. AFK: welcome back + notify when an AFK user is mentioned/replied to
  const afk = db.data.afk;
  const isAfkCmd = m.body.toLowerCase().startsWith(config.PREFIX + 'afk');
  if (afk[m.number] && !isAfkCmd) {
    const away = timeAgo(Date.now() - afk[m.number].since);
    delete afk[m.number];
    db.save();
    await ctx.reply(`👋 Welcome back! You were AFK for ${away}.`);
  }
  const targets = new Set([...m.mentioned, m.quoted?.sender].filter(Boolean));
  for (const t of targets) {
    const a = afk[num(t)];
    if (a) await conn.sendMessage(m.from, { text: `💤 @${num(t)} is AFK: ${a.reason}\n(${timeAgo(Date.now() - a.since)} ago)`, mentions: [t] }, { quoted: mek });
  }
  return false;
}

module.exports = { run };
