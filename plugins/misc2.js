/** afk, calc, fancy, tts, url */
const axios = require('axios');
const FormData = require('form-data');
const { create, all } = require('mathjs');
const tts = require('google-tts-api');
const db = require('../lib/db');
const fancy = require('../lib/fancy');

const base = { category: 'misc', filename: __filename };

// ---- Safe calculator (mathjs with dangerous functions disabled) ----
const math = create(all);
const evaluate = math.evaluate.bind(math);
const disabled = () => { throw new Error('Function disabled'); };
math.import({ import: disabled, createUnit: disabled, evaluate: disabled, parse: disabled, simplify: disabled, derivative: disabled, resolve: disabled }, { override: true });
const BLOCK = /factorial|permutations|combinations|zeros|ones|identity|eye|range|random|!|\^\s*\(?\s*\d{4,}/i;

const EXT = { imageMessage: 'jpg', videoMessage: 'mp4', audioMessage: 'mp3', stickerMessage: 'webp', documentMessage: 'bin' };

module.exports = [
  {
    ...base, pattern: 'afk', desc: 'Set yourself as away', use: '[reason]',
    async execute(conn, mek, m, { q, reply }) {
      db.data.afk[m.number] = { reason: q || 'Away', since: Date.now() };
      db.save();
      reply(`💤 You're now AFK: ${q || 'Away'}\nI'll tell people who mention you.`);
    },
  },
  {
    ...base, pattern: 'calc', alias: ['math'], desc: 'Calculator', use: '<expression>',
    async execute(conn, mek, m, { q, reply }) {
      if (!q) return reply('Usage: .calc 12*(3+4)^2   or   .calc 5 km to miles');
      if (q.length > 100 || BLOCK.test(q)) return reply('❌ Expression not allowed.');
      const res = evaluate(q);
      reply(`🧮 ${q}\n= *${typeof res === 'function' ? 'n/a' : math.format(res, { precision: 14 })}*`);
    },
  },
  {
    ...base, pattern: 'fancy', desc: 'Fancy text styles (".fancy 3 text" for one style)', use: '[style#] <text>',
    async execute(conn, mek, m, { args, q, reply }) {
      if (!q) return reply('Usage: .fancy Hello World\n.fancy 3 Hello World');
      const styles = fancy.all('');
      const pick = /^\d+$/.test(args[0]) && args.length > 1 ? Number(args[0]) : null;
      const text = pick ? args.slice(1).join(' ') : q;
      const list = fancy.all(text);
      if (pick) return reply(list[pick - 1] ? list[pick - 1][1] : `Pick a style from 1-${styles.length}.`);
      reply(list.map(([name, out], i) => `*${i + 1}. ${name}*\n${out}`).join('\n\n'));
    },
  },
  {
    ...base, pattern: 'tts', alias: ['say'], desc: 'Text to speech (voice note)', use: '[lang] <text>',
    async execute(conn, mek, m, { args, from, reply }) {
      const hasLang = args.length > 1 && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(args[0]);
      const lang = hasLang ? args[0] : 'en';
      const text = (hasLang ? args.slice(1) : args).join(' ') || m.quoted?.text;
      if (!text) return reply('Usage: .tts hello world   or   .tts ur مرحبا');
      const parts = await tts.getAllAudioBase64(text.slice(0, 600), { lang, slow: false, host: 'https://translate.google.com', splitPunct: ',.?!;' });
      const buf = Buffer.concat(parts.map((p) => Buffer.from(p.base64, 'base64')));
      await conn.sendMessage(from, { audio: buf, mimetype: 'audio/mpeg', ptt: true }, { quoted: mek });
    },
  },
  {
    ...base, pattern: 'url', alias: ['upload', 'tourl'], desc: 'Upload media to catbox.moe and get a link', use: '<reply to media>',
    async execute(conn, mek, m, { reply }) {
      if (!m.media) return reply('Reply to an image, video, audio, sticker or file.');
      const buf = await m.media.download();
      if (buf.length > 100 * 1024 * 1024) return reply('File too large (100MB max).');
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', buf, { filename: `upload.${EXT[m.media.type] || 'bin'}` });
      const { data } = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders(), timeout: 120000, maxBodyLength: Infinity });
      reply(`🔗 ${String(data).trim()}`);
    },
  },
];
