/**
 * Message parsing + plugin execution.
 */
const baileys = require('@whiskeysockets/baileys');
const config = require('../config');
const plugins = require('./plugins');
const log = require('./logger');
const db = require('./db');
const hooks = require('./hooks');
const { baileysLogger } = require('./logger');

const { getContentType, downloadMediaMessage } = baileys;
const MEDIA = ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage'];
const num = (jid = '') => jid.split('@')[0].split(':')[0];

// Unwrap ephemeral / view-once containers
const unwrap = (msg) =>
  msg?.ephemeralMessage?.message || msg?.viewOnceMessage?.message ||
  msg?.viewOnceMessageV2?.message || msg?.documentWithCaptionMessage?.message || msg;

function getBody(message, type) {
  const c = message[type];
  return message.conversation || c?.text || c?.caption || c?.selectedButtonId || c?.singleSelectReply?.selectedRowId || '';
}

// Cache group metadata for 60s
const groupCache = new Map();
async function getGroup(conn, jid) {
  const hit = groupCache.get(jid);
  if (hit && Date.now() - hit.t < 60000) return hit.data;
  const data = await conn.groupMetadata(jid);
  groupCache.set(jid, { t: Date.now(), data });
  return data;
}

/** Build the simplified message object `m` passed to plugins. */
function buildM(conn, mek) {
  mek.message = unwrap(mek.message);
  const message = mek.message;
  const type = getContentType(message);
  const from = mek.key.remoteJid;
  const isGroup = from.endsWith('@g.us');
  const sender = mek.key.fromMe
    ? conn.user.id
    : (isGroup ? (mek.key.participantPn || mek.key.participant) : from);
  const ctx = message[type]?.contextInfo;

  const m = {
    id: mek.key.id, key: mek.key, message, type, from, isGroup, sender,
    number: num(sender), pushName: mek.pushName || '',
    fromMe: !!mek.key.fromMe,
    timestamp: Number(mek.messageTimestamp) || Math.floor(Date.now() / 1000),
    body: getBody(message, type),
    mentioned: ctx?.mentionedJid || [],
    quoted: null,
    media: null,
  };

  if (ctx?.quotedMessage) {
    const qm = unwrap(ctx.quotedMessage);
    const qtype = getContentType(qm);
    const fake = { key: { remoteJid: from, id: ctx.stanzaId, participant: ctx.participant, fromMe: false }, message: qm };
    m.quoted = {
      message: qm, type: qtype, sender: ctx.participant, key: fake.key,
      text: getBody(qm, qtype),
      download: () => downloadMediaMessage(fake, 'buffer', {}, { logger: baileysLogger, reuploadRequest: conn.updateMediaMessage }),
    };
  }

  // m.media = the media to act on: own attachment first, else the quoted one
  if (MEDIA.includes(type)) {
    m.media = { type, download: () => downloadMediaMessage(mek, 'buffer', {}, { logger: baileysLogger, reuploadRequest: conn.updateMediaMessage }) };
  } else if (m.quoted && MEDIA.includes(m.quoted.type)) {
    m.media = { type: m.quoted.type, download: m.quoted.download };
  }
  return m;
}

async function handleUpsert(conn, { messages, type: upsertType }) {
  if (upsertType !== 'notify') return;
  for (const mek of messages) {
    if (!mek.message || mek.key.remoteJid === 'status@broadcast') continue;
    try { await handleMessage(conn, mek); } catch (err) { log.error({ err }, 'handleMessage failed'); }
  }
}

async function handleMessage(conn, mek) {
  const m = buildM(conn, mek);
  const prefix = config.PREFIX;

  const isOwner = m.fromMe || m.number === config.OWNER_NUMBER;
  const isSudo = isOwner || config.SUDO.includes(m.number);
  const reply = (text) => conn.sendMessage(m.from, { text }, { quoted: mek });

  // Group context: only fetched for commands or groups with antilink enabled
  let groupMetadata = null, participants = [], isAdmin = false, isBotAdmin = false;
  const needGroup = m.isGroup && (m.body.startsWith(prefix) || db.data.groups[m.from]?.antilink);
  if (needGroup) {
    try {
      groupMetadata = await getGroup(conn, m.from);
      participants = groupMetadata.participants;
      const admins = participants.filter((p) => p.admin).map((p) => num(p.id));
      isAdmin = admins.includes(m.number);
      isBotAdmin = admins.includes(num(conn.user.id));
    } catch (err) { log.warn({ err }, 'Could not fetch group metadata'); }
  }
  Object.assign(m, { reply, isOwner, isSudo, isAdmin, isBotAdmin });

  // Passive features (activity tracking, AFK, antilink). Returns true if message was consumed.
  if (await hooks.run(conn, mek, m, { isOwner, isSudo, isAdmin, isBotAdmin, reply })) return;

  if (!m.body || !m.body.startsWith(prefix)) return;
  const [cmd, ...args] = m.body.slice(prefix.length).trim().split(/\s+/);
  const plugin = plugins.get((cmd || '').toLowerCase());
  if (!plugin) return;
  if (config.WORK_TYPE === 'private' && !isSudo) return; // private mode: owner/sudo only

  const helpers = { args, q: args.join(' '), command: cmd.toLowerCase(), prefix, isOwner, isSudo, isGroup: m.isGroup,
    isAdmin, isBotAdmin, groupMetadata, participants, sender: m.sender, from: m.from, reply };

  try {
    await plugin.execute(conn, mek, m, helpers);
  } catch (err) {
    log.error({ err }, `Command "${cmd}" failed`);
    await reply(`❌ Error in *${cmd}*: ${err.message}`).catch(() => {});
  }
}

module.exports = { handleUpsert, buildM };
