const { toWebp, toPng, addExif, defaults } = require('../lib/sticker');

module.exports = [
  {
    pattern: 'sticker', alias: ['s', 'stick'], category: 'sticker',
    desc: 'Convert image/short video to sticker (optional: pack|author)', use: '<reply to image/video> [pack|author]',
    filename: __filename,
    async execute(conn, mek, m, { from, q, reply }) {
      if (!m.media || !['imageMessage', 'videoMessage'].includes(m.media.type))
        return reply('Reply to (or send with caption) an image or short video.');
      const d = defaults();
      const [pack, author] = q ? q.split('|').map((s) => s.trim()) : [d.pack, d.author];
      let webp = await toWebp(await m.media.download(), m.media.type === 'videoMessage');
      webp = await addExif(webp, pack || d.pack, author || d.author);
      await conn.sendMessage(from, { sticker: webp }, { quoted: mek });
    },
  },
  {
    pattern: 'photo', alias: ['toimg'], category: 'sticker', desc: 'Convert a (static) sticker to an image',
    use: '<reply to sticker>', filename: __filename,
    async execute(conn, mek, m, { from, reply }) {
      if (m.media?.type !== 'stickerMessage') return reply('Reply to a sticker.');
      await conn.sendMessage(from, { image: await toPng(await m.media.download()) }, { quoted: mek });
    },
  },
];
