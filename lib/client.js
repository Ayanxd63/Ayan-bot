/**
 * WhatsApp connection: QR / pairing code login, auto-reconnect, graceful shutdown.
 */
const readline = require('readline');
const qrcode = require('qrcode-terminal');
const baileys = require('@whiskeysockets/baileys');
const config = require('../config');
const log = require('./logger');
const db = require('./db');
const { baileysLogger } = require('./logger');
const { getAuthState } = require('./session');
const { handleUpsert } = require('./events');

const makeWASocket = baileys.default || baileys.makeWASocket;
const { DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = baileys;

let loginMode = null; // { type: 'qr' } | { type: 'pair', number }
let attempts = 0;
let shuttingDown = false;
let current = null;

const ask = (q) =>
  new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); res(a); });
  });

/** Decide QR vs pairing code (only asked once, only when not yet registered). */
async function chooseLoginMode() {
  if (loginMode) return loginMode;
  if (process.env.PAIR_NUMBER) {
    loginMode = { type: 'pair', number: process.env.PAIR_NUMBER.replace(/\D/g, '') };
  } else if (process.stdin.isTTY) {
    const choice = (await ask('Login method: [1] QR code  [2] Pairing code > ')).trim();
    if (choice === '2') {
      const number = (await ask('WhatsApp number with country code (e.g. 923001234567) > ')).replace(/\D/g, '');
      loginMode = { type: 'pair', number };
    }
  }
  return (loginMode ||= { type: 'qr' });
}

async function connect() {
  const { state, saveCreds, clear } = await getAuthState();
  const mode = state.creds.registered ? null : await chooseLoginMode();
  const { version } = await fetchLatestBaileysVersion();

  const conn = makeWASocket({
    version,
    logger: baileysLogger,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async () => undefined,
  });
  current = conn;
  let pairRequested = false;

  conn.ev.on('creds.update', saveCreds);

  conn.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      if (mode?.type === 'pair') {
        if (pairRequested) return;
        pairRequested = true;
        try {
          const code = await conn.requestPairingCode(mode.number);
          log.info(`PAIRING CODE: ${code.match(/.{1,4}/g).join('-')}  (WhatsApp > Linked devices > Link with phone number)`);
        } catch (err) {
          log.error({ err }, 'Could not get pairing code');
        }
      } else {
        log.info('Scan this QR code with WhatsApp > Linked devices:');
        qrcode.generate(qr, { small: true });
      }
    }

    if (connection === 'open') {
      attempts = 0;
      log.info(`${config.BOT_NAME} connected as ${conn.user?.id}`);
      const owner = `${config.OWNER_NUMBER}@s.whatsapp.net`;
      conn.sendMessage(owner, { text: `✅ *${config.BOT_NAME}* is online.\nPlugins: ${config.getPluginCount()}` }).catch(() => {});
    }

    if (connection === 'close') {
      if (shuttingDown) return;
      const code = lastDisconnect?.error?.output?.statusCode;
      log.warn(`Connection closed (code ${code})`);

      if (code === DisconnectReason.loggedOut) {            // 401
        log.error('Logged out. Clearing session; restart to link again.');
        await clear();
        loginMode = null;
      } else if (code === DisconnectReason.connectionReplaced) { // 440
        log.error('Session opened elsewhere. Exiting.');
        return process.exit(1);
      } else if (code === DisconnectReason.forbidden) {     // 403
        log.error('Account forbidden/banned. Exiting.');
        return process.exit(1);
      }
      // 408 timedOut, 515 restartRequired, 428, 500, 503 ... -> reconnect with backoff
      const delay = code === DisconnectReason.restartRequired ? 500 : Math.min(30000, 2000 * 2 ** attempts++);
      log.info(`Reconnecting in ${delay}ms`);
      setTimeout(() => connect().catch((err) => log.error({ err }, 'Reconnect failed')), delay);
    }
  });

  conn.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      if (!db.data.groups[id]?.welcome || !['add', 'remove'].includes(action)) return;
      const meta = await conn.groupMetadata(id).catch(() => null);
      for (const p of participants) {
        const jid = p.id || p;
        const n = jid.split('@')[0].split(':')[0];
        const text = action === 'add'
          ? `👋 Welcome @${n} to *${meta?.subject || 'the group'}*!`
          : `👋 Goodbye @${n}.`;
        await conn.sendMessage(id, { text, mentions: [jid] });
      }
    } catch (err) { log.warn({ err }, 'welcome handler failed'); }
  });

  conn.ev.on('messages.upsert', (u) => handleUpsert(conn, u).catch((err) => log.error({ err }, 'Handler error')));
  return conn;
}

async function shutdown(signal) {
  log.info(`${signal} received, shutting down`);
  shuttingDown = true;
  try { current?.end(undefined); } catch {}
  await Promise.race([db.flush(true), new Promise((r) => setTimeout(r, 3000))]);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { connect };
