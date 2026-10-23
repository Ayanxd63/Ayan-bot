/** Unicode "fancy text" styles. All blocks are hole-free so mapping is a simple offset. */
const STYLES = [
  ['Bold', 0x1D400, 0x1D41A, 0x1D7CE],
  ['Bold Italic', 0x1D468, 0x1D482],
  ['Sans', 0x1D5A0, 0x1D5BA, 0x1D7E2],
  ['Sans Bold', 0x1D5D4, 0x1D5EE, 0x1D7EC],
  ['Sans Italic', 0x1D608, 0x1D622],
  ['Sans Bold Italic', 0x1D63C, 0x1D656],
  ['Monospace', 0x1D670, 0x1D68A, 0x1D7F6],
  ['Script Bold', 0x1D4D0, 0x1D4EA],
  ['Fraktur Bold', 0x1D56C, 0x1D586],
  ['Circled', 0x24B6, 0x24D0],
];
const SMALL_CAPS = Array.from('ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ');

const apply = ([, up, low, dig], text) =>
  Array.from(text).map((c) => {
    const k = c.charCodeAt(0);
    if (k >= 65 && k <= 90) return String.fromCodePoint(up + k - 65);
    if (k >= 97 && k <= 122) return String.fromCodePoint(low + k - 97);
    if (dig && k >= 48 && k <= 57) return String.fromCodePoint(dig + k - 48);
    return c;
  }).join('');

function all(text) {
  const out = STYLES.map((s) => [s[0], apply(s, text)]);
  out.push(['Small Caps', Array.from(text).map((c) => (/[a-z]/i.test(c) ? SMALL_CAPS[c.toLowerCase().charCodeAt(0) - 97] : c)).join('')]);
  return out;
}
module.exports = { all };
