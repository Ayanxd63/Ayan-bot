/** YouTube helpers shared by download plugins. */
const yts = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const { MB } = require('./utils');
const MAX = 60 * MB;

async function resolve(q) {
  if (ytdl.validateURL(q)) {
    const v = (await ytdl.getBasicInfo(q)).videoDetails;
    return { url: q, title: v.title, thumbnail: v.thumbnails.at(-1)?.url, author: v.author?.name, duration: v.lengthSeconds + 's' };
  }
  const r = (await yts(q)).videos[0];
  if (!r) throw new Error('No results found.');
  return { url: r.url, title: r.title, thumbnail: r.thumbnail, author: r.author?.name, duration: r.timestamp };
}

async function toBuffer(url, opts) {
  const stream = ytdl(url, opts);
  const chunks = []; let size = 0;
  for await (const c of stream) {
    size += c.length;
    if (size > MAX) { stream.destroy(); throw new Error('File too large for WhatsApp (>60MB).'); }
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/** Search + send audio. withCard sends a thumbnail/info message first. */
async function sendAudio(conn, mek, from, query, withCard) {
  const v = await resolve(query);
  if (withCard && v.thumbnail)
    await conn.sendMessage(from, { image: { url: v.thumbnail }, caption: `🎵 *${v.title}*\n👤 ${v.author}\n⏱️ ${v.duration}` }, { quoted: mek });
  const buf = await toBuffer(v.url, { filter: 'audioonly', quality: 'highestaudio' });
  await conn.sendMessage(from, { audio: buf, mimetype: 'audio/mp4', fileName: `${v.title}.m4a` }, { quoted: mek });
}

module.exports = { resolve, toBuffer, sendAudio };
