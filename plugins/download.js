/** YouTube downloads. If these break, update @distube/ytdl-core. */
const { resolve, toBuffer, sendAudio } = require('../lib/yt');

const audio = (card) => async (conn, mek, m, { q, from, reply }) => {
  if (!q) return reply('Give a song name or YouTube link.');
  await reply('🔎 Searching...');
  await sendAudio(conn, mek, from, q, card);
};

module.exports = [
  { pattern: 'song', category: 'download', desc: 'Search & download audio', use: '<name | url>', filename: __filename, execute: audio(true) },
  { pattern: 'play', category: 'download', desc: 'Search & play audio', use: '<name | url>', filename: __filename, execute: audio(true) },
  { pattern: 'yta', category: 'download', desc: 'YouTube audio from link', use: '<url>', filename: __filename, execute: audio(false) },
  ...['ytv', 'video'].map((pattern) => ({
    pattern, category: 'download', desc: 'YouTube video (360p)', use: '<name | url>', filename: __filename,
    async execute(conn, mek, m, { q, from, reply }) {
      if (!q) return reply('Give a video name or YouTube link.');
      await reply('🔎 Searching...');
      const v = await resolve(q);
      const buf = await toBuffer(v.url, { filter: 'audioandvideo', quality: 'highest' });
      await conn.sendMessage(from, { video: buf, caption: `🎬 ${v.title}` }, { quoted: mek });
    },
  })),
];
