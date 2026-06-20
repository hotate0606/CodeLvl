// 依存なしの最小 PNG デコーダ/エンコーダ（8bit RGBA, 非インタレースのみ対応）。
// zlib(inflate/deflate) は Node 標準。色替え/切り抜きツール用の共通モジュール。
const zlib = require('zlib');
const fs = require('fs');

function decode(path) {
  const b = fs.readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not png: ' + path);
  const W = b.readUInt32BE(16), H = b.readUInt32BE(20);
  const bitDepth = b[24], colorType = b[25], interlace = b[28];
  if (bitDepth !== 8 || colorType !== 6) throw new Error('only 8bit RGBA supported');
  if (interlace !== 0) throw new Error('interlace not supported');
  // IDAT を連結
  let off = 33; // 8(sig)+25(IHDR chunk: 4 len+4 type+13 data... ) → 実際は走査する
  off = 8;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = W * bpp;
  const out = Buffer.alloc(H * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++];
    const cur = out.subarray(y * stride, y * stride + stride);
    raw.copy(cur, 0, p, p + stride); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const bb = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      switch (ft) {
        case 1: v = (v + a) & 255; break;
        case 2: v = (v + bb) & 255; break;
        case 3: v = (v + ((a + bb) >> 1)) & 255; break;
        case 4: {
          const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 255; break;
        }
      }
      cur[x] = v;
    }
    prev = cur;
  }
  return { width: W, height: H, data: out };
}

function encode(path, img) {
  const { width: W, height: H, data } = img;
  const stride = W * 4;
  const raw = Buffer.alloc(H * (stride + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const comp = zlib.deflateSync(raw, { level: 9 });
  const chunks = [];
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  chunks.push(sig);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', comp));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(path, Buffer.concat(chunks));
}

const CRCT = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// 部分矩形を新しい RGBA 画像として切り出す
function crop(img, x, y, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let r = 0; r < h; r++) {
    const sy = y + r;
    if (sy < 0 || sy >= img.height) continue;
    for (let c = 0; c < w; c++) {
      const sx = x + c;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4, di = (r * w + c) * 4;
      img.data.copy(out, di, si, si + 4);
    }
  }
  return { width: w, height: h, data: out };
}

module.exports = { decode, encode, crop };
