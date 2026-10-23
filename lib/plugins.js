/**
 * Dynamic plugin loader. Reads every .js file in /plugins.
 * A file may export one plugin object or an array of them.
 */
const fs = require('fs');
const path = require('path');
const log = require('./logger');

const DIR = path.join(__dirname, '..', 'plugins');
const commands = new Map(); // trigger/alias -> plugin
let list = [];

function load() {
  commands.clear();
  list = [];
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
    const full = path.join(DIR, file);
    try {
      delete require.cache[require.resolve(full)];
      for (const p of [].concat(require(full))) {
        if (!p || !p.pattern || typeof p.execute !== 'function') {
          log.warn(`Skipped invalid plugin entry in ${file}`);
          continue;
        }
        list.push(p);
        commands.set(p.pattern.toLowerCase(), p);
        (p.alias || []).forEach((a) => commands.set(a.toLowerCase(), p));
      }
    } catch (err) {
      log.error({ err }, `Failed to load plugin ${file}`);
    }
  }
  log.info(`Loaded ${list.length} commands`);
  return list.length;
}

module.exports = {
  load,
  get: (name) => commands.get(name.toLowerCase()),
  all: () => list,
  count: () => list.length,
};
