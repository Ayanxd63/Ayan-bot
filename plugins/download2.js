/**
 * TikTok, Facebook, Instagram, MediaFire, APK, Spotify.
 * Third-party endpoints can change; see README for notes.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { getBuffer, MB } = require('../lib/utils');
const { sendAudio } = require('../lib/yt');

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const isUrl = (s) => /^https?:\/\//i.test(s || '');

/** cobalt (self-hosted) -> direct media URL */
async function cobalt(url) {
  if (!process.env.COBALT_API) throw new Error('Set COBALT_API to your cobalt instance URL (see README).');
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (process.env.COBALT_API_KEY) headers.Authorization = `Api-Key ${process.env.COBALT_API_KEY}`;
  const { data } = await axios.post(process.env.COBALT_API, { url, videoQuality: '720' }, { headers, timeout: 60000 });
  if (data.status === 'error') throw new Error(`cobalt: ${data.error?.code || 'failed'}`);
  if (data.status === 'picker') return data.picker[0].url;
  return data.url;
}

async function sendFromUrl(conn, mek, from, url, caption) {
  const { buffer, mime } = await getBuffer(url);
  const content = mime.startsWith('image') ? { image: buffer, caption } : { video: buffer, caption };
  await conn.sendMessage(from, content, { quoted: mek });
}

const social = (label, re, fallback) => async (conn, mek, m, { q, from, reply }) => {
  if (!re.test(q)) return reply(`Send a valid ${label} link.`);
  await reply('⏳ Downloading...');
  let url;
  try { url = await cobalt(q); }
  catch (e) { if (fallback) url = await fallback(q); else throw e; }
  await sendFromUrl(conn, mek, from, url, `✅ ${label}`);
};

// TikTok: keyless via tikwm, cobalt as backup
const tiktokFallback = async (link) => {
  const { data } = await axios.get('https://www.tikwm.com/api/', { params: { url: link, hd: 1 }, timeout: 30000 });
  if (!data?.data) throw new Error('TikTok video not found.');
  return data.data.hdplay || data.data.play;
};
async function tiktok(conn, mek, m, { q, from, reply }) {
  if (!/tiktok\.com/i.test(q)) return reply('Send a TikTok link.');
  await reply('⏳ Downloading...');
  let url;
  try { url = await tiktokFallback(q); } catch (e) { url = await cobalt(q); }
  await sendFromUrl(conn, mek, from, url, '✅ TikTok');
}

async function mediafire(conn, mek, m, { q, from, reply }) {
  if (!/mediafire\.com/i.test(q)) return reply('Send a MediaFire link.');
  await reply('⏳ Fetching...');
  const { data: html } = await axios.get(q, { headers: { 'User-Agent': UA }, timeout: 30000 });
  const $ = cheerio.load(html);
  const btn = $('#downloadButton');
  let dl = btn.attr('href');
  const scrambled = btn.attr('data-scrambled-url');
  if (scrambled) dl = Buffer.from(scrambled, 'base64').toString();
  if (!dl || dl.startsWith('javascript')) dl = (html.match(/https?:\/\/download[^"']+/) || [])[0];
  if (!dl) throw new Error('Could not find the download link.');
  const fileName = $('.dl-btn-label').attr('title') || decodeURIComponent(dl.split('/').pop().split('?')[0]);
  const { buffer, mime } = await getBuffer(dl, { max: 100 * MB, headers: { 'User-Agent': UA } });
  await conn.sendMessage(from, { document: buffer, fileName, mimetype: mime || 'application/octet-stream' }, { quoted: mek });
}

async function apk(conn, mek, m, { q, from, reply }) {
  if (!q) return reply('Usage: .apk <app name>');
  await reply('🔎 Searching Aptoide...');
  const { data } = await axios.get('https://ws75.aptoide.com/api/7/apps/search', { params: { query: q, limit: 1 }, timeout: 30000 });
  const app = data?.datalist?.list?.[0];
  if (!app) return reply('No app found.');
  const sizeMB = (app.file?.filesize || app.size || 0) / MB;
  if (sizeMB > 100) return reply(`📦 ${app.name} is ${sizeMB.toFixed(0)}MB — too large to send.`);
  if (app.icon) await conn.sendMessage(from, { image: { url: app.icon }, caption: `📱 *${app.name}*\n📦 ${app.package}\n💾 ${sizeMB.toFixed(1)} MB` }, { quoted: mek });
  const { buffer } = await getBuffer(app.file.path, { max: 100 * MB, headers: { 'User-Agent': UA } });
  await conn.sendMessage(from, { document: buffer, fileName: `${app.name}.apk`, mimetype: 'application/vnd.android.package-archive' }, { quoted: mek });
}

let spotifyToken = { value: null, exp: 0 };
async function spotifyAuth() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.');
  if (spotifyToken.value && Date.now() < spotifyToken.exp) return spotifyToken.value;
  const { data } = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  spotifyToken = { value: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return spotifyToken.value;
}
async function spotify(conn, mek, m, { q, from, reply }) {
  if (!q) return reply('Usage: .spotify <song name | spotify track link>');
  const headers = { Authorization: `Bearer ${await spotifyAuth()}` };
  const id = (q.match(/track\/([A-Za-z0-9]+)/) || [])[1];
  let track;
  if (id) track = (await axios.get(`https://api.spotify.com/v1/tracks/${id}`, { headers })).data;
  else track = (await axios.get('https://api.spotify.com/v1/search', { headers, params: { q, type: 'track', limit: 1 } })).data.tracks.items[0];
  if (!track) return reply('Track not found.');
  const artists = track.artists.map((a) => a.name).join(', ');
  await conn.sendMessage(from, {
    image: { url: track.album.images[0]?.url },
    caption: `🎧 *${track.name}*\n👤 ${artists}\n💿 ${track.album.name}\n\n_Spotify can't be downloaded directly; fetching the audio from YouTube..._`,
  }, { quoted: mek });
  await sendAudio(conn, mek, from, `${artists} - ${track.name} audio`, false);
}

const base = { category: 'download', filename: __filename };
module.exports = [
  { ...base, pattern: 'tiktok', alias: ['tt'], desc: 'TikTok video (no watermark)', use: '<url>', execute: tiktok },
  { ...base, pattern: 'fb', alias: ['facebook'], desc: 'Facebook video', use: '<url>', execute: social('Facebook', /facebook\.com|fb\.watch/i) },
  { ...base, pattern: 'insta', alias: ['ig', 'instagram'], desc: 'Instagram reel/post', use: '<url>', execute: social('Instagram', /instagram\.com/i) },
  { ...base, pattern: 'mediafire', alias: ['mf'], desc: 'MediaFire file', use: '<url>', execute: mediafire },
  { ...base, pattern: 'apk', alias: ['app'], desc: 'Download APK (Aptoide)', use: '<app name>', execute: apk },
  { ...base, pattern: 'spotify', desc: 'Spotify track (audio via YouTube)', use: '<name | link>', execute: spotify },
];
