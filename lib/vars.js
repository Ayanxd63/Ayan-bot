const fs = require('fs');
const path = require('path');
const config = require('../config');
const read = () => { try { return JSON.parse(fs.readFileSync(config.VARS_FILE, 'utf8')); } catch { return {}; } };
const set = (k, v) => {
  process.env[k] = v;
  fs.mkdirSync(path.dirname(config.VARS_FILE), { recursive: true });
  fs.writeFileSync(config.VARS_FILE, JSON.stringify({ ...read(), [k]: v }, null, 2));
};
module.exports = { read, set };
