const axios = require('axios');

module.exports = [
  {
    pattern: 'gpt', alias: ['openai', 'ai'], category: 'ai', desc: 'Ask ChatGPT', use: '<question>',
    filename: __filename,
    async execute(conn, mek, m, { q, reply }) {
      if (!process.env.OPENAI_API_KEY) return reply('Set OPENAI_API_KEY first (.setvar OPENAI_API_KEY=...).');
      if (!q) return reply('Ask something, e.g. .gpt what is Node.js?');
      const { data } = await axios.post('https://api.openai.com/v1/chat/completions',
        { model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [{ role: 'user', content: q }] },
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, timeout: 60000 });
      await reply(data.choices[0].message.content.trim());
    },
  },
  {
    pattern: 'gemini', alias: ['bard'], category: 'ai', desc: 'Ask Google Gemini', use: '<question>',
    filename: __filename,
    async execute(conn, mek, m, { q, reply }) {
      if (!process.env.GEMINI_API_KEY) return reply('Set GEMINI_API_KEY first (.setvar GEMINI_API_KEY=...).');
      if (!q) return reply('Ask something, e.g. .gemini explain DNS');
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { contents: [{ parts: [{ text: q }] }] },
        { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, timeout: 60000 });
      await reply(data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || 'No response.');
    },
  },
];
