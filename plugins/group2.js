/** add, invite, warn, inactives + antilink / welcome toggles */
const config = require('../config');
const db = require('../lib/db');
const { num, getTarget, guardGroup, timeAgo } = require('../lib/utils');

const base = { category: 'group', filename: __filename };

const toggle = (key, label) => async (conn, mek, m, ctx) => {
  const err = guardGroup(ctx, { botAdmin: false }); if (err) return ctx.reply(err);
  const state = (ctx.args[0] || '').toLowerCase();
  if (!['on', 'off'].includes(state)) {
    return ctx.reply(`${label} is *${db.data.groups[ctx.from]?.[key] ? 'ON' : 'OFF'}*.\nUsage: .${ctx.command} on|off`);
  }
  (db.data.groups[ctx.from] ||= {})[key] = state === 'on';
  db.save();
  ctx.reply(`✅ ${label} turned *${state.toUpperCase()}*.`);
};

module.exports = [
  {
    ...base, pattern: 'add', desc: 'Add a member by number', use: '<number>',
    async execute(conn, mek, m, ctx) {
      const err = guardGroup(ctx); if (err) return ctx.reply(err);
      const n = (ctx.args[0] || '').replace(/\D/g, '');
      if (n.length < 7) return ctx.reply('Usage: .add 923001234567');
      const jid = `${n}@s.whatsapp.net`;
      const [res] = await conn.groupParticipantsUpdate(ctx.from, [jid], 'add');
      const status = String(res?.status);
      if (status === '200') return ctx.reply(`✅ @${n} added.`);
      if (status === '409') return ctx.reply('ℹ️ Already in the group.');
      if (status === '408') return ctx.reply('⚠️ That user recently left; try again later.');
      if (status === '403') { // privacy settings: send an invite instead
        const code = await conn.groupInviteCode(ctx.from);
        await conn.sendMessage(jid, { text: `You're invited to join *${ctx.groupMetadata?.subject}*:\nhttps://chat.whatsapp.com/${code}` }).catch(() => {});
        return ctx.reply('📨 Their privacy settings block direct adds; I sent them an invite link.');
      }
      ctx.reply(`❌ Could not add (status ${status}).`);
    },
  },
  {
    ...base, pattern: 'invite', alias: ['link', 'gclink'], desc: 'Get (or revoke) the group invite link', use: '[revoke]',
    async execute(conn, mek, m, ctx) {
      const err = guardGroup(ctx); if (err) return ctx.reply(err);
      if ((ctx.args[0] || '').toLowerCase() === 'revoke') {
        const code = await conn.groupRevokeInvite(ctx.from);
        return ctx.reply(`♻️ Link reset:\nhttps://chat.whatsapp.com/${code}`);
      }
      ctx.reply(`🔗 https://chat.whatsapp.com/${await conn.groupInviteCode(ctx.from)}`);
    },
  },
  {
    ...base, pattern: 'warn', desc: 'Warn a member (auto-kick at limit); "warn reset @user" clears', use: '<@user | reply> [reason]',
    async execute(conn, mek, m, ctx) {
      const err = guardGroup(ctx, { botAdmin: false }); if (err) return ctx.reply(err);
      const reset = (ctx.args[0] || '').toLowerCase() === 'reset';
      const target = getTarget(m, reset ? ctx.args.slice(1) : ctx.args);
      if (!target) return ctx.reply('Mention or reply to the user. Usage: .warn @user [reason]');
      const t = num(target);
      const warns = (db.data.warns[ctx.from] ||= {});
      if (reset) { delete warns[t]; db.save(); return ctx.reply(`✅ Warnings cleared for @${t}.`); }
      if (t === config.OWNER_NUMBER || t === num(conn.user.id)) return ctx.reply('🚫 Not allowed on owner/bot.');

      const limit = Number(process.env.WARN_LIMIT || 3);
      const reason = ctx.args.filter((a) => !a.startsWith('@') && !/^\d{7,}$/.test(a)).join(' ') || 'No reason given';
      warns[t] = (warns[t] || 0) + 1;
      if (warns[t] >= limit) {
        delete warns[t]; db.save();
        if (ctx.isBotAdmin) {
          await conn.groupParticipantsUpdate(ctx.from, [target], 'remove');
          return conn.sendMessage(ctx.from, { text: `🚨 @${t} reached ${limit} warnings and was removed.`, mentions: [target] }, { quoted: mek });
        }
        return conn.sendMessage(ctx.from, { text: `🚨 @${t} reached ${limit} warnings (I'm not admin, so I can't remove them).`, mentions: [target] }, { quoted: mek });
      }
      db.save();
      await conn.sendMessage(ctx.from, { text: `⚠️ @${t} warned (${warns[t]}/${limit})\nReason: ${reason}`, mentions: [target] }, { quoted: mek });
    },
  },
  {
    ...base, pattern: 'inactives', alias: ['inactive'], desc: 'List members with no messages in N days (default 7)', use: '[days]',
    async execute(conn, mek, m, ctx) {
      const err = guardGroup(ctx, { botAdmin: false }); if (err) return ctx.reply(err);
      const days = Math.max(1, Number(ctx.args[0]) || 7);
      const cutoff = Date.now() - days * 86400000;
      const activity = db.data.activity[ctx.from] || {};
      const idle = ctx.participants.filter((p) => (activity[num(p.id)]?.last || 0) < cutoff && num(p.id) !== num(conn.user.id));
      if (!idle.length) return ctx.reply(`✅ Everyone has been active in the last ${days} day(s).`);
      const since = new Date(db.data.meta.start).toLocaleDateString('en-GB', { timeZone: config.TIMEZONE });
      const lines = idle.map((p) => {
        const last = activity[num(p.id)]?.last;
        return `• @${num(p.id)} — ${last ? timeAgo(Date.now() - last) + ' ago' : 'no messages seen'}`;
      });
      await conn.sendMessage(ctx.from, {
        text: `😴 *Inactive for ${days}+ day(s)* (${idle.length})\n_Tracking since ${since}_\n\n${lines.join('\n')}`,
        mentions: idle.map((p) => p.id),
      }, { quoted: mek });
    },
  },
  { ...base, pattern: 'antilink', desc: 'Delete WhatsApp group links from non-admins', use: 'on|off', execute: toggle('antilink', 'Antilink') },
  { ...base, pattern: 'welcome', desc: 'Welcome/goodbye messages', use: 'on|off', execute: toggle('welcome', 'Welcome messages') },
];
