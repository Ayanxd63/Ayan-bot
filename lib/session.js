/**
 * Auth state providers:
 *   1. MongoDB        (MONGODB_URI)  - persistent, best for ephemeral hosts
 *   2. Base64 string  (SESSION_ID)   - restores creds.json into ./session
 *   3. Local files    (./session)    - default
 * Each returns { state, saveCreds, clear }.
 */
const fs = require('fs');
const path = require('path');
const baileys = require('@whiskeysockets/baileys');
const log = require('./logger');

const { useMultiFileAuthState, initAuthCreds, BufferJSON, proto } = baileys;
const SESSION_DIR = path.join(__dirname, '..', 'session');

async function mongoAuthState(uri) {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const col = client.db(process.env.MONGODB_DB || 'ayanxd').collection('auth');
  log.info('Session storage: MongoDB');

  const read = async (id) => {
    const doc = await col.findOne({ _id: id });
    return doc ? JSON.parse(doc.v, BufferJSON.reviver) : null;
  };
  const write = (id, val) =>
    col.updateOne({ _id: id }, { $set: { v: JSON.stringify(val, BufferJSON.replacer) } }, { upsert: true });
  const del = (id) => col.deleteOne({ _id: id });

  const creds = (await read('creds')) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async (id) => {
            let v = await read(`${type}-${id}`);
            if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
            data[id] = v;
          }));
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const type in data) {
            for (const id in data[type]) {
              const v = data[type][id];
              tasks.push(v ? write(`${type}-${id}`, v) : del(`${type}-${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => write('creds', creds),
    clear: () => col.deleteMany({}),
  };
}

async function fileAuthState() {
  // Restore from SESSION_ID (format: AYAN~<base64 of creds.json>) if no local creds
  const credsPath = path.join(SESSION_DIR, 'creds.json');
  if (process.env.SESSION_ID && !fs.existsSync(credsPath)) {
    try {
      const b64 = process.env.SESSION_ID.split('~').pop();
      fs.mkdirSync(SESSION_DIR, { recursive: true });
      fs.writeFileSync(credsPath, Buffer.from(b64, 'base64').toString('utf8'));
      log.info('Session restored from SESSION_ID');
    } catch (err) {
      log.error({ err }, 'Invalid SESSION_ID');
    }
  }
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  return { state, saveCreds, clear: async () => fs.rmSync(SESSION_DIR, { recursive: true, force: true }) };
}

async function getAuthState() {
  if (process.env.MONGODB_URI) return mongoAuthState(process.env.MONGODB_URI);
  return fileAuthState();
}

module.exports = { getAuthState, SESSION_DIR };
