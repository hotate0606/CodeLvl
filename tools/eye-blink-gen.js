// ゴールド最終進化：コマ0を静止体にして「目だけ瞬き」する待機シートを生成。
// 既存シートに閉じ目が無いので、検出した目領域にまぶた（上下から下りる肌色カーテン＋
// 中央の閉じ線）を合成して半開き/閉じコマを作る。全コマ体は完全に同一＝loadSheetで
// 整列したとき目だけが変化する。
const { decode, encode, crop } = require('./png');

const SHEET = 'renderer/assets/モーション/ニシアフ最終進化待機3.png';
const COUNT = 11;
const sheet = decode(SHEET);
const FW = Math.round(sheet.width / COUNT);
const f0 = crop(sheet, 0, 0, FW, sheet.height); // コマ0（目開き・静止体）

// 検出済みの目（眼球）領域。eye-detect.js の結果を眼球に寄せた値。
const EYE = { x: 26, y: 76, w: 22, h: 14 };

function at(im, x, y) { const i = (y * im.width + x) * 4; return [im.data[i], im.data[i+1], im.data[i+2], im.data[i+3]]; }
function put(im, x, y, c) { const i = (y * im.width + x) * 4; im.data[i]=c[0]; im.data[i+1]=c[1]; im.data[i+2]=c[2]; im.data[i+3]=c[3] ?? 255; }
function darken(c, f) { return [c[0]*f|0, c[1]*f|0, c[2]*f|0, 255]; }
function mix(a, b, t) { return [a[0]+(b[0]-a[0])*t|0, a[1]+(b[1]-a[1])*t|0, a[2]+(b[2]-a[2])*t|0, 255]; }

// まぶたの代表色＝目のすぐ上の鱗肌の中央値（明るい琥珀スジを避けるため暗め寄りの中央値）。
function medianSkin() {
  const samples = [];
  for (let y = EYE.y - 6; y < EYE.y - 1; y++)
    for (let x = EYE.x + 2; x < EYE.x + EYE.w - 2; x++) {
      const c = at(f0, x, y);
      if (c[3] > 200) samples.push(c);
    }
  samples.sort((a, b) => (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]));
  return samples[Math.floor(samples.length * 0.45)] || [120, 80, 45, 255];
}
const LID = medianSkin();
const LID_HI = mix(LID, [255,255,255], 0.18); // まぶた上側のハイライト
const LID_LO = darken(LID, 0.7);              // 閉じ線付近の陰
console.log('まぶた色 LID=', LID.slice(0,3));

// t=0(開)〜1(閉)。上から肌色のまぶたが下りてくる（下まぶたはわずかに持ち上がる）。
function makeFrame(t) {
  const fr = crop(f0, 0, 0, FW, f0.height); // f0のコピー
  if (t <= 0) return fr;
  const slit = EYE.y + EYE.h * 0.62;                 // 閉じたときの合わせ目（やや下）
  const topEdge = EYE.y + (slit - EYE.y) * t;        // 上まぶたの下端
  const botEdge = (EYE.y + EYE.h) - (EYE.y + EYE.h - slit) * (t * 0.35); // 下まぶたは控えめ
  // 眼球は丸い → 矩形でなく内接楕円でマスクして角を落とす
  const cx = EYE.x + EYE.w / 2, cy = EYE.y + EYE.h / 2, rx = EYE.w / 2, ry = EYE.h / 2;
  for (let x = EYE.x; x < EYE.x + EYE.w; x++) {
    for (let y = EYE.y; y < EYE.y + EYE.h; y++) {
      if (at(f0, x, y)[3] < 40) continue;            // 体の外は触らない
      const ex = (x + 0.5 - cx) / rx, ey = (y + 0.5 - cy) / ry;
      if (ex * ex + ey * ey > 1) continue;           // 楕円の外は触らない
      if (y <= topEdge) {
        // 上端→合わせ目で HI→LO のごく弱いグラデ（のっぺり防止）
        const k = (y - EYE.y) / Math.max(1, slit - EYE.y);
        put(fr, x, y, mix(LID_HI, LID_LO, Math.min(1, k)));
      } else if (y >= botEdge) {
        put(fr, x, y, LID);
      }
    }
  }
  // ほぼ閉じたら合わせ目に陰の線
  if (t > 0.8) {
    const ly = Math.round(slit);
    for (let x = EYE.x + 1; x < EYE.x + EYE.w - 1; x++) {
      if (at(f0, x, ly)[3] < 40) continue;
      const ex = (x + 0.5 - cx) / rx, ey = (ly + 0.5 - cy) / ry;
      if (ex * ex + ey * ey > 1) continue;
      put(fr, x, ly, darken(LID, 0.45));
    }
  }
  return fr;
}

// 瞬き1サイクル：開→半→閉→半（loadSheetの再生はコマ0で静止するのでコマ0=開）
const ts = [0, 0.5, 1, 0.5];
const frames = ts.map(makeFrame);

// 横1列に連結して書き出し
const out = { width: FW * frames.length, height: f0.height, data: Buffer.alloc(FW * frames.length * f0.height * 4) };
frames.forEach((fr, i) => {
  for (let y = 0; y < fr.height; y++) {
    const si = (y * fr.width) * 4;
    const di = (y * out.width + i * FW) * 4;
    fr.data.copy(out.data, di, si, si + fr.width * 4);
  }
});
const OUT = 'renderer/assets/モーション/ニシアフ最終進化瞬き3.png';
encode(OUT, out);
console.log(`wrote ${OUT} : ${frames.length}コマ ${out.width}x${out.height}`);

// プレビュー：閉じコマの目周辺を5倍で
function up(im,s){const W=im.width*s,H=im.height*s,d=Buffer.alloc(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const si=((y/s|0)*im.width+(x/s|0))*4,di=(y*W+x)*4;im.data.copy(d,di,si,si+4);}return{width:W,height:H,data:d};}
encode('tools/_eye/blink_closed.png', up(crop(frames[2], EYE.x-18, EYE.y-18, 60, 55), 6));
encode('tools/_eye/blink_half.png',   up(crop(frames[1], EYE.x-18, EYE.y-18, 60, 55), 6));
console.log('preview: tools/_eye/blink_closed.png / blink_half.png');
