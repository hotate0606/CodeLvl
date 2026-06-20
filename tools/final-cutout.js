// 最終進化ニシアフ.png（紫背景・RGB・3体並び）から背景の紫だけを抜いて
// 透過RGBA(8bit colorType6)で書き出す。キャラ色は紫から十分遠いので距離クロマキーで抜ける。
//   - 距離 d<TIN → 完全透明 / d>TOUT → 不透明 / 間はフェザー（境界をなめらかに）
//   - 半透明ピクセルは紫成分を引いて縁の紫ハロを除去（unmix）
// 使い方: node tools/final-cutout.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { encode } = require('./png');

const SRC = path.join(__dirname, '../renderer/assets/ニシアフ/最終進化ニシアフ.png');
const OUT = path.join(__dirname, '../renderer/assets/ニシアフ/最終進化ニシアフ_切抜.png');

// 背景紫（複数サンプルの代表値）と判定しきい値
const BG = [104, 48, 182];
const TIN = 72;   // これ未満は背景＝透明
const TOUT = 120; // これ超は完全に本体＝不透明

// colorType 2(RGB) / 6(RGBA) 両対応の最小デコーダ
function decodeRGB(p) {
  const b = fs.readFileSync(p);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  const W = b.readUInt32BE(16), H = b.readUInt32BE(20);
  const bitDepth = b[24], colorType = b[25], interlace = b[28];
  if (bitDepth !== 8 || interlace !== 0) throw new Error('only 8bit non-interlaced');
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (!ch) throw new Error('only RGB/RGBA');
  let off = 8; const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const t = b.toString('ascii', off + 4, off + 8);
    if (t === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
    off += 12 + len;
    if (t === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = W * ch, out = Buffer.alloc(H * stride);
  let prev = Buffer.alloc(stride), pp = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[pp++];
    const cur = out.subarray(y * stride, y * stride + stride);
    raw.copy(cur, 0, pp, pp + stride); pp += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0;
      const bb = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = cur[x];
      switch (ft) {
        case 1: v = (v + a) & 255; break;
        case 2: v = (v + bb) & 255; break;
        case 3: v = (v + ((a + bb) >> 1)) & 255; break;
        case 4: { const q = a + bb - c, pa = Math.abs(q-a), pb = Math.abs(q-bb), pc = Math.abs(q-c); v = (v + (pa<=pb&&pa<=pc?a:pb<=pc?bb:c)) & 255; break; }
      }
      cur[x] = v;
    }
    prev = cur;
  }
  return { width: W, height: H, data: out, ch };
}

const img = decodeRGB(SRC);
const { width: W, height: H, ch } = img;
const rgba = Buffer.alloc(W * H * 4);

let cut = 0, edge = 0;
for (let i = 0; i < W * H; i++) {
  const si = i * ch;
  const r = img.data[si], g = img.data[si + 1], b = img.data[si + 2];
  const dr = r - BG[0], dg = g - BG[1], db = b - BG[2];
  const d = Math.sqrt(dr*dr + dg*dg + db*db);
  let a;
  if (d <= TIN) a = 0;
  else if (d >= TOUT) a = 255;
  else a = Math.round(((d - TIN) / (TOUT - TIN)) * 255);
  const di = i * 4;
  let or = r, og = g, ob = b;
  // 半透明の縁：背景紫を差し引いて純粋な本体色に近づける（紫ハロ除去）
  if (a > 0 && a < 255) {
    const t = a / 255; // 本体の混合率
    or = Math.max(0, Math.min(255, Math.round((r - BG[0] * (1 - t)) / t)));
    og = Math.max(0, Math.min(255, Math.round((g - BG[1] * (1 - t)) / t)));
    ob = Math.max(0, Math.min(255, Math.round((b - BG[2] * (1 - t)) / t)));
    edge++;
  }
  if (a === 0) cut++;
  rgba[di] = or; rgba[di + 1] = og; rgba[di + 2] = ob; rgba[di + 3] = a;
}

encode(OUT, { width: W, height: H, data: rgba });

// 透過した実体の左右の塊（3体）のXバウンディングを簡易検出して確認用に出力
const colHas = new Array(W).fill(0);
for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (rgba[(y*W+x)*4+3] > 40) { colHas[x] = 1; break; }
const spans = [];
let s = -1;
for (let x = 0; x <= W; x++) {
  if (x < W && colHas[x]) { if (s < 0) s = x; }
  else if (s >= 0) { if (x - s > 30) spans.push([s, x-1]); s = -1; }
}
console.log(`size ${W}x${H}  transparent=${(cut/(W*H)*100).toFixed(1)}%  feathered=${edge}`);
console.log('detected body spans (x):', spans.map(([a,b]) => `${a}-${b}`).join('  '));
console.log('wrote', OUT);
