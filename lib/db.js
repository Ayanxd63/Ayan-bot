/**
 * Persistent bot data (AFK, warns, group settings, activity).
 *  - MONGODB_URI set  -> stored in MongoDB (survives redeploys on Heroku/Koyeb/Render)
 *  - otherwise        -> stored in data/db.json
 * `data` is mutated in place, so other modules can hold a reference to it.
 * Call `await init()` once at startup. `save()` is debounced; `flush()` forces a write.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'db.json');
const defaults = () => ({ afk: {}, warns: {}, groups: {}, activity: {}, meta: { start: Date.now() } });

const data = defaults();
let col = null;      // Mongo collection when active
let client = null;
let dirty = false;
let timer = null;

const replaceData = (obj) => {
  for (const k of Object.keys(data)) delete data[k];
  Object.assign(data, defaults(), obj);
};

try { replaceData(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch {}

const writeFile = () => {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(data)); } catch {}
};

/** Connect to MongoDB (if configured) and load saved data. Falls back to file storage on failure. */
async function init() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  const log = require('./logger');
  try {
    const { MongoClient } = require('mongodb');
    client = new MongoClient(uri);
    await client.connect();
    col = client.db(process.env.MONGODB_DB || 'ayanxd').collection('bot_data');
    const doc = await col.findOne({ _id: 'db' });
    if (doc) replaceData(JSON.parse(doc.v));
    else await flush(true); // first run: seed Mongo (also migrates an existing data/db.json)
    log.info('Database storage: MongoDB');
  } catch (err) {
    col = null;
    log.error({ err }, 'MongoDB unavailable for bot data; using data/db.json');
  }
}

/** Write now. */
async function flush(force = false) {
  if (!dirty && !force) return;
  dirty = false;
  if (!col) return writeFile();
  try {
    await col.updateOne({ _id: 'db' }, { $set: { v: JSON.stringify(data) } }, { upsert: true });
  } catch (err) {
    dirty = true; // retry on next save
    require('./logger').warn({ err }, 'Could not write bot data to MongoDB');
  }
}

/** Mark changed; writes at most once every 5s. */
function save() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, 5000);
  timer.unref?.();
}

// Last-resort sync save for file mode (Mongo needs the async flush() on shutdown)
process.on('exit', () => { if (!col && dirty) writeFile(); });

module.exports = { data, init, save, flush };
