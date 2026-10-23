const axios = require('axios');
const MB = 1024 * 1024;

const num = (j = '') => String(j).split('@')[0].split(':')[0];

/** Download a URL into a Buffer with a size cap. */
async function getBuffer(url, { headers, max = 60 * MB, timeout = 120000 } = {}) {
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', headers, maxContentLength: max, maxBodyLength: max, timeout });
    return { buffer: Buffer.from(r.data), mime: r.headers['content-type'] || '' };
  } catch (e) {
    if (/maxContentLength|maxBodyLength/i.test(e.message)) throw new Error(`File is larger than the ${Math.round(max / MB)}MB limit.`);
    throw e;
  }
}

const timeAgo = (ms) => {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
};

/** Target user from @mention, replied message, or typed number. */
const getTarget = (m, args) =>
  m.mentioned[0] || m.quoted?.sender ||
  (args[0] && /\d{7,}/.test(args[0]) ? args[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);

/** Group permission check. Returns an error string or null. */
function guardGroup(ctx, { botAdmin = true } = {}) {
  if (!ctx.isGroup) return '⛔ Groups only.';
  if (!ctx.isAdmin && !ctx.isSudo) return '⛔ Admins only.';
  if (botAdmin && !ctx.isBotAdmin) return '⛔ Make me an admin first.';
  return null;
}

module.exports = { MB, num, getBuffer, timeAgo, getTarget, guardGroup };
