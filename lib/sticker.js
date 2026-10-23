/** ffmpeg + WebP exif helpers for stickers. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const config = require('../config');

// Use system ffmpeg if present; otherwise the bundled ffmpeg-static (for panels without ffmpeg)
try {
  if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
  else require('child_process').execSync('ffmpeg -version', { stdio: 'ignore' });
} catch {
  try { ffmpeg.setFfmpegPath(require('ffmpeg-static')); } catch {}
}

const tmp = (ext) => path.join(os.tmpdir(), `${crypto.randomBytes(6).toString('hex')}.${ext}`);

async function ff(buffer, inExt, outExt, configure) {
  const inp = tmp(inExt), out = tmp(outExt);
  fs.writeFileSync(inp, buffer);
  try {
    await new Promise((res, rej) => {
      const cmd = ffmpeg(inp);
      configure(cmd);
      cmd.on('end', res).on('error', rej).save(out);
    });
    return fs.readFileSync(out);
  } finally {
    for (const f of [inp, out]) try { fs.unlinkSync(f); } catch {}
  }
}

/** Image/video -> 512x512 WebP (animated for video, max 8s). */
const toWebp = (buffer, isVideo, inExt) => ff(buffer, inExt || (isVideo ? 'mp4' : 'jpg'), 'webp', (cmd) => {
  const vf = "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=15," +
    'pad=512:512:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse';
  const opts = ['-vcodec', 'libwebp', '-vf', vf];
  if (isVideo) opts.push('-loop', '0', '-t', '8', '-preset', 'default', '-an', '-vsync', '0');
  cmd.addOutputOptions(opts).toFormat('webp');
});

/** Image -> circular 512x512 WebP. */
const toCircle = (buffer) => ff(buffer, 'jpg', 'webp', (cmd) => {
  const vf = "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba," +
    "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-W/2,Y-H/2),W/2),255,0)'";
  cmd.addOutputOptions(['-vcodec', 'libwebp', '-lossless', '1', '-vf', vf]).toFormat('webp');
});

/** WebP -> PNG */
const toPng = (buffer) => ff(buffer, 'webp', 'png', (cmd) => cmd.toFormat('png'));

/** Embed pack name / author into a WebP sticker. Falls back to the original on failure. */
async function addExif(buffer, pack, author) {
  try {
    const { Image } = require('node-webpmux');
    const img = new Image();
    await img.load(buffer);
    const json = {
      'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
      'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: ['🤖'],
    };
    const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const body = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([head, body]);
    exif.writeUIntLE(body.length, 14, 4);
    img.exif = exif;
    return await img.save(null);
  } catch {
    return buffer;
  }
}

const defaults = () => ({
  pack: process.env.STICKER_PACK || config.BOT_NAME,
  author: process.env.STICKER_AUTHOR || config.OWNER_NAME,
});

module.exports = { toWebp, toCircle, toPng, addExif, defaults };
