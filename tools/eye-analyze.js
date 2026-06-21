// ゴールド最終進化 待機シートを解析：コマ分割・各コマbbox・コマ0との差分ヒートマップ。
// 目（瞬き）の位置と、まばたきしているコマを自動で特定するための下調べ。
const { decode } = require('./png');

const SHEET = 'renderer/assets/モーション/ニシアフ最終進化待機3.png';
const COUNT = 11;
const img = decode(SHEET);
const FW = Math.round(img.width / COUNT); // 1コマ幅
console.log(`sheet ${img.width}x${img.height}, ${COUNT}コマ, 1コマ=${FW}x${img.height}`);

function px(x, y) { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i+1], img.data[i+2], img.data[i+3]]; }

// 各コマの不透明bbox
const bboxes = [];
for (let f = 0; f < COUNT; f++) {
  const x0f = f * FW;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < FW; x++) {
      const a = px(x0f + x, y)[3];
      if (a > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  bboxes.push({ minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 });
}
console.log('\n各コマ bbox (コマ内ローカル座標):');
bboxes.forEach((b, i) => console.log(` f${i}: x[${b.minX}-${b.maxX}] y[${b.minY}-${b.maxY}] w${b.w} h${b.h}`));

// コマ0基準の上半身(頭)領域での差分。各コマ vs コマ0、RGB差の合計を 8x8 グリッドで集計。
const GX = FW, GY = img.height;
function diffMap(f) {
  const map = []; // [y][x] 0..1 正規化前の差
  const base = 0; // f0
  let maxd = 0;
  const grid = Array.from({length: GY}, () => new Float32Array(GX));
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < FW; x++) {
      const a = px(x, y), b = px(f * FW + x, y);
      // 両方ほぼ透明ならスキップ
      const d = Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) + Math.abs(a[3]-b[3]);
      grid[y][x] = d;
      if (d > maxd) maxd = d;
    }
  }
  return { grid, maxd };
}

console.log('\nコマ0との総差分（体の動き＋瞬き込み）:');
for (let f = 1; f < COUNT; f++) {
  const { grid } = diffMap(f);
  let sum = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < FW; x++) sum += grid[y][x];
  console.log(` f${f}: 総差分=${(sum/1000).toFixed(0)}k`);
}

// 隣接コマ差分（瞬きは局所・短時間で起きるので隣接差のピークが目を示しやすい）
console.log('\n差分の重心と集中範囲（コマ0基準、上位差分ピクセルのbbox）:');
for (let f = 1; f < COUNT; f++) {
  const { grid, maxd } = diffMap(f);
  const th = maxd * 0.5;
  let minX=1e9,minY=1e9,maxX=-1,maxY=-1,cx=0,cy=0,n=0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < FW; x++) {
    if (grid[y][x] >= th) { if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y; cx+=x;cy+=y;n++; }
  }
  if (n) console.log(` f${f}: 強差分bbox x[${minX}-${maxX}] y[${minY}-${maxY}] 重心(${(cx/n)|0},${(cy/n)|0}) px数=${n}`);
}
