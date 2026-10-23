const config = require('../config');
const db = require('../lib/db');

module.exports = [
  {
    pattern: 'alive',
    alias: ['status'],
    category: 'misc',
    desc: 'Check bot status',
    use: '',
    filename: __filename,
    async execute(conn, mek, m, { reply }) {
      const latency = Math.max(0, Date.now() - m.timestamp * 1000);
      const { used, total } = config.getRam();
      await reply(
        `🤖 *${config.BOT_NAME}* is alive!\n\n` +
        `⚡ Latency : ${latency} ms\n🧠 RAM : ${used}/${total} MB\n⏱️ Uptime : ${config.getUptime()}\n` +
        `🔌 Mode : ${config.WORK_TYPE}\n👑 Owner : ${config.OWNER_NAME} (@${config.OWNER_NUMBER})`
      );
    },
  },
  {
    pattern: 'ping',
    category: 'misc',
    desc: 'Measure response latency',
    use: '',
    filename: __filename,
    async execute(conn, mek, m, { from }) {
      const t = Date.now();
      const sent = await conn.sendMessage(from, { text: 'Pinging...' }, { quoted: mek });
      await conn.sendMessage(from, { text: `🏓 Pong! ${Date.now() - t} ms`, edit: sent.key });
    },
  },
  {
    pattern: 'reboot',
    alias: ['restart'],
    category: 'misc',
    desc: 'Restart the bot (owner only; PM2/Docker restarts it)',
    use: '',
    filename: __filename,
    async execute(conn, mek, m, { isOwner, reply }) {
      if (!isOwner) return reply('⛔ Owner only.');
      await reply('♻️ Restarting...');
      await db.flush(true);
      setTimeout(() => process.exit(0), 500);
    },
  },
];
