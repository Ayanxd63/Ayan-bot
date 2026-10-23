const config = require('../config');

const num = (j = '') => j.split('@')[0].split(':')[0];

/** Resolve target from @mention, replied message, or typed number. */
const getTarget = (m, args) =>
  m.mentioned[0] || m.quoted?.sender ||
  (args[0] && /\d{7,}/.test(args[0]) ? args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);

/** Common permission checks. Returns an error string or null. */
function guard(ctx, { botAdmin = true } = {}) {
  if (!ctx.isGroup) return '⛔ Groups only.';
  if (!ctx.isAdmin && !ctx.isSudo) return '⛔ Admins only.';
  if (botAdmin && !ctx.isBotAdmin) return '⛔ Make me an admin first.';
  return null;
}

const participantAction = (name, action, doneText) => ({
  pattern: name, category: 'group', desc: `${name} a member`, use: '<@user | reply | number>', filename: __filename,
  async execute(conn, mek, m, ctx) {
    const err = guard(ctx); if (err) return ctx.reply(err);
    const target = getTarget(m, ctx.args);
    if (!target) return ctx.reply(`Mention, reply to, or type the number of the user.`);
    const t = num(target);
    if (action === 'remove' && (t === config.OWNER_NUMBER || t === num(conn.user.id))) return ctx.reply('🚫 Not allowed on owner/bot.');
    await conn.groupParticipantsUpdate(ctx.from, [target], action);
    await conn.sendMessage(ctx.from, { text: `✅ @${t} ${doneText}`, mentions: [target] }, { quoted: mek });
  },
});

module.exports = [
  participantAction('kick', 'remove', 'removed'),
  participantAction('promote', 'promote', 'promoted to admin'),
  participantAction('demote', 'demote', 'demoted'),
  {
    pattern: 'mute', category: 'group', desc: 'Only admins can send messages', use: '', filename: __filename,
    async execute(conn, mek, m, ctx) {
      const err = guard(ctx); if (err) return ctx.reply(err);
      await conn.groupSettingUpdate(ctx.from, 'announcement');
      ctx.reply('🔇 Group muted (admins only).');
    },
  },
  {
    pattern: 'unmute', category: 'group', desc: 'Allow everyone to send messages', use: '', filename: __filename,
    async execute(conn, mek, m, ctx) {
      const err = guard(ctx); if (err) return ctx.reply(err);
      await conn.groupSettingUpdate(ctx.from, 'not_announcement');
      ctx.reply('🔊 Group unmuted.');
    },
  },
  {
    pattern: 'tagall', alias: ['everyone'], category: 'group', desc: 'Mention all members', use: '<message>', filename: __filename,
    async execute(conn, mek, m, ctx) {
      const err = guard(ctx, { botAdmin: false }); if (err) return ctx.reply(err);
      const ids = ctx.participants.map((p) => p.id);
      const text = `📢 *${ctx.q || 'Attention everyone!'}*\n\n` + ids.map((j) => `• @${num(j)}`).join('\n');
      await conn.sendMessage(ctx.from, { text, mentions: ids }, { quoted: mek });
    },
  },
];
