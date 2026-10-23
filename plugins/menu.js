const config = require('../config');
const registry = require('../lib/plugins');

const ORDER = ['ai', 'download', 'group', 'misc', 'sticker', 'vars'];

module.exports = {
  pattern: 'menu',
  alias: ['help', 'list'],
  category: 'misc',
  hidden: true, // not shown inside the menu itself
  desc: 'Show the command menu',
  use: '',
  filename: __filename,
  async execute(conn, mek, m, { reply, prefix }) {
    const tz = config.TIMEZONE;
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { timeZone: tz, hour12: true });
    const day = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
    const date = now.toLocaleDateString('en-GB', { timeZone: tz });
    const { used, total } = config.getRam();

    let out = `╭═══ ${config.BOT_NAME} ═══⊷
┃❃╭──────────────
┃❃│ Prefix : ${prefix}
┃❃│ User : ${m.pushName || m.number}
┃❃│ Time : ${time}
┃❃│ Day : ${day}
┃❃│ Date : ${date}
┃❃│ Version : ${config.VERSION}
┃❃│ Plugins : ${config.getPluginCount()}
┃❃│ Ram : ${used}/${total}MB
┃❃│ Uptime : ${config.getUptime()}
┃❃│ Platform : ${config.getPlatform()}
┃❃╰───────────────
╰═════════════════⊷\n`;

    // Group commands by category (built dynamically from loaded plugins)
    const cats = {};
    for (const p of registry.all()) {
      if (p.hidden) continue;
      (cats[(p.category || 'misc').toLowerCase()] ||= new Set()).add(p.pattern.toUpperCase());
    }
    const names = [...ORDER.filter((c) => cats[c]), ...Object.keys(cats).filter((c) => !ORDER.includes(c))];
    for (const c of names) {
      out += `\n╭─❏ ${c.toUpperCase()} ❏\n│ ${[...cats[c]].sort().join(' | ')}\n╰─────────────────`;
    }
    await reply(out);
  },
};
