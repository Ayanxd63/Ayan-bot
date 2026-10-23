const axios = require('axios');
const config = require('../config');
const vars = require('../lib/vars');
const { toWebp, toCircle, addExif, defaults } = require('../lib/sticker');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = [
  {
    pattern: 'circle', category: 'sticker', desc: 'Make a circular sticker from an image', use: '<reply to image>',
    filename: __filename,
    async execute(conn, mek, m, { from, reply }) {
      if (m.media?.type !== 'imageMessage') return reply('Reply to an image.');
      const d = defaults();
      const webp = await addExif(await toCircle(await m.media.download()), d.pack, d.author);
      await conn.sendMessage(from, { sticker: webp }, { quoted: mek });
    },
  },
  {
    pattern: 'take', alias: ['steal'], category: 'sticker', desc: 'Re-pack a sticker with your own name', use: '<reply to sticker> [pack|author]',
    filename: __filename,
    async execute(conn, mek, m, { from, q, reply }) {
      if (m.media?.type !== 'stickerMessage') return reply('Reply to a sticker.');
      const [pack, author] = q ? q.split('|').map((s) => s.trim()) : [m.pushName || config.BOT_NAME, config.BOT_NAME];
      const webp = await addExif(await m.media.download(), pack, author || config.BOT_NAME);
      await conn.sendMessage(from, { sticker: webp }, { quoted: mek });
    },
  },
  {
    pattern: 'exif', category: 'sticker', desc: 'Set default sticker pack/author (owner)', use: 'pack|author',
    filename: __filename,
    async execute(conn, mek, m, { q, isOwner, reply }) {
      if (!isOwner) return reply('⛔ Owner only.');
      const [pack, author] = q.split('|').map((s) => s.trim());
      if (!pack) { const d = defaults(); return reply(`Current: ${d.pack} | ${d.author}\nUsage: .exif pack|author`); }
      vars.set('STICKER_PACK', pack);
      if (author) vars.set('STICKER_AUTHOR', author);
      reply(`✅ Default sticker info set to: ${pack} | ${author || defaults().author}`);
    },
  },
  {
    pattern: 'tg', alias: ['tgsticker'], category: 'sticker', desc: 'Import a Telegram sticker pack', use: '<t.me/addstickers/NAME> [count]',
    filename: __filename,
    async execute(conn, mek, m, { args, from, reply }) {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return reply('Set TELEGRAM_BOT_TOKEN first (create a bot with @BotFather).');
      const input = args[0] || '';
      const name = (input.match(/addstickers\/([A-Za-z0-9_]+)/) || [null, input.replace(/[^A-Za-z0-9_]/g, '')])[1];
      if (!name) return reply('Usage: .tg https://t.me/addstickers/PackName [count]');
      const limit = Math.min(Number(args[1]) || 8, 20);

      const api = `https://api.telegram.org/bot${token}`;
      const { data } = await axios.get(`${api}/getStickerSet`, { params: { name }, timeout: 30000 });
      const stickers = data.result.stickers.filter((s) => !s.is_animated).slice(0, limit); // skip .tgs
      if (!stickers.length) return reply('No importable (non-Lottie) stickers in that pack.');
      await reply(`📦 Sending ${stickers.length} sticker(s) from *${data.result.title}*...`);

      const d = defaults();
      for (const s of stickers) {
        try {
          const f = await axios.get(`${api}/getFile`, { params: { file_id: s.file_id } });
          const file = await axios.get(`https://api.telegram.org/file/bot${token}/${f.data.result.file_path}`, { responseType: 'arraybuffer' });
          let buf = Buffer.from(file.data);
          if (s.is_video) buf = await toWebp(buf, true, 'webm');
          buf = await addExif(buf, d.pack, d.author);
          await conn.sendMessage(from, { sticker: buf });
          await sleep(700);
        } catch { /* skip failed sticker */ }
      }
    },
  },
];
