/** Extra AI commands: groq, or (OpenRouter), dall (OpenAI images), bing (free image gen), upscale (Replicate), rmbg (remove.bg). */
const axios = require('axios');
const FormData = require('form-data');
const { getBuffer } = require('../lib/utils');

const base = { category: 'ai', filename: __filename };
const prompt = (q, m) => q || m.quoted?.text || '';

/** OpenAI-compatible chat helper */
const chat = (label, url, keyVar, modelVar, defModel, extraHeaders = {}) => async (conn, mek, m, { q, reply }) => {
  const key = process.env[keyVar];
  if (!key) return reply(`Set ${keyVar} first (.setvar ${keyVar}=...).`);
  const text = prompt(q, m);
  if (!text) return reply(`Ask something, e.g. .${label} explain DNS`);
  const { data } = await axios.post(url, { model: process.env[modelVar] || defModel, messages: [{ role: 'user', content: text }] },
    { headers: { Authorization: `Bearer ${key}`, ...extraHeaders }, timeout: 60000 });
  await reply(data.choices[0].message.content.trim());
};

async function dall(conn, mek, m, { q, from, reply }) {
  if (!process.env.OPENAI_API_KEY) return reply('Set OPENAI_API_KEY first.');
  const text = prompt(q, m);
  if (!text) return reply('Usage: .dall a cat astronaut, watercolor');
  await reply('🎨 Generating...');
  const model = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
  const body = { model, prompt: text, size: '1024x1024', n: 1 };
  if (!model.startsWith('gpt-image')) body.response_format = 'b64_json';
  const { data } = await axios.post('https://api.openai.com/v1/images/generations', body,
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 120000 });
  const img = data.data[0];
  await conn.sendMessage(from, { image: img.b64_json ? Buffer.from(img.b64_json, 'base64') : { url: img.url }, caption: `🎨 ${text}` }, { quoted: mek });
}

// Keyless image generation via Pollinations
async function bing(conn, mek, m, { q, from, reply }) {
  const text = prompt(q, m);
  if (!text) return reply('Usage: .bing a futuristic city at night');
  await reply('🎨 Generating...');
  const { buffer } = await getBuffer(`https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&nologo=true`, { timeout: 120000 });
  await conn.sendMessage(from, { image: buffer, caption: `🖼️ ${text}` }, { quoted: mek });
}

async function upscale(conn, mek, m, { from, reply }) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return reply('Set REPLICATE_API_TOKEN first (replicate.com).');
  if (m.media?.type !== 'imageMessage') return reply('Reply to an image.');
  await reply('🔍 Upscaling (may take up to a minute)...');
  const image = `data:image/jpeg;base64,${(await m.media.download()).toString('base64')}`;
  const headers = { Authorization: `Bearer ${token}` };
  let { data } = await axios.post('https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions',
    { input: { image, scale: 4, face_enhance: false } }, { headers: { ...headers, Prefer: 'wait' }, timeout: 120000 });
  for (let i = 0; i < 30 && !['succeeded', 'failed', 'canceled'].includes(data.status); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    data = (await axios.get(data.urls.get, { headers })).data;
  }
  if (data.status !== 'succeeded') throw new Error(`Upscale ${data.status}: ${data.error || 'timed out'}`);
  const { buffer } = await getBuffer(Array.isArray(data.output) ? data.output[0] : data.output);
  await conn.sendMessage(from, { document: buffer, fileName: 'upscaled.png', mimetype: 'image/png' }, { quoted: mek });
}

async function rmbg(conn, mek, m, { from, reply }) {
  const key = process.env.REMOVEBG_API_KEY;
  if (!key) return reply('Set REMOVEBG_API_KEY first (remove.bg).');
  if (m.media?.type !== 'imageMessage') return reply('Reply to an image.');
  await reply('✂️ Removing background...');
  const form = new FormData();
  form.append('image_file', await m.media.download(), { filename: 'image.jpg' });
  form.append('size', 'auto');
  const { data } = await axios.post('https://api.remove.bg/v1.0/removebg', form,
    { headers: { ...form.getHeaders(), 'X-Api-Key': key }, responseType: 'arraybuffer', timeout: 60000 });
  // Sent as a document so the transparent PNG isn't flattened by WhatsApp
  await conn.sendMessage(from, { document: Buffer.from(data), fileName: 'no-bg.png', mimetype: 'image/png' }, { quoted: mek });
}

module.exports = [
  { ...base, pattern: 'groq', desc: 'Ask Groq (Llama)', use: '<question>',
    execute: chat('groq', 'https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY', 'GROQ_MODEL', 'llama-3.3-70b-versatile') },
  { ...base, pattern: 'or', alias: ['openrouter'], desc: 'Ask any model via OpenRouter', use: '<question>',
    execute: chat('or', 'https://openrouter.ai/api/v1/chat/completions', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'openrouter/auto') },
  { ...base, pattern: 'dall', desc: 'Generate an image (OpenAI)', use: '<prompt>', execute: dall },
  { ...base, pattern: 'bing', alias: ['imagine'], desc: 'Generate an image (free, no key)', use: '<prompt>', execute: bing },
  { ...base, pattern: 'upscale', desc: 'Upscale an image 4x (Replicate)', use: '<reply to image>', execute: upscale },
  { ...base, category: 'misc', pattern: 'rmbg', desc: 'Remove image background (remove.bg)', use: '<reply to image>', execute: rmbg },
];
