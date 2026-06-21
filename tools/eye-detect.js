// コマ0の顔領域から「瞳（最も暗い不透明クラスタ）」を自動検出し、目のbboxを返す。
// 検証用に赤枠を重ねた画像も書き出す。
const { decode, encode, crop } = require('./png');

const SHEET = 'renderer/assets/モーション/ニシアフ最終進化待機3.png';
const COUNT = 11;
const sheet = decode(SHEET);
const FW = Math.round(sheet.width / COUNT);
const f0 = crop(sheet, 0, 0, FW, sheet.height);

function px(im, x, y) { const i = (y * im.width + x) * 4; return [im.data[i], im.data[i+1], im.data[i+2], im.data[i+3]]; }
function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

// 顔の探索範囲（左向きの頭部の目の周辺）。frame座標。
const RX0 = 24, RX1 = 52, RY0 = 74, RY1 = 96;

// 暗い不透明ピクセルを収集（瞳）
let pts = [];
for (let y = RY0; y < RY1; y++) for (let x = RX0; x < RX1; x++) {
  const [r, g, b, a] = px(f0, x, y);
  if (a > 200 && lum(r, g, b) < 70) pts.push([x, y]);
}
// 最大連結クラスタ（4近傍）を取る＝瞳
const key = (x, y) => x + ',' + y;
const set = new Set(pts.map(p => key(p[0], p[1])));
const seen = new Set();
let best = [];
for (const [sx, sy] of pts) {
  if (seen.has(key(sx, sy))) continue;
  const stack = [[sx, sy]], comp = [];
  seen.add(key(sx, sy));
  while (stack.length) {
    const [x, y] = stack.pop(); comp.push([x, y]);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const k = key(x+dx, y+dy);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x+dx, y+dy]); }
    }
  }
  if (comp.length > best.length) best = comp;
}
let minX=1e9,minY=1e9,maxX=-1,maxY=-1,cx=0,cy=0;
for (const [x, y] of best) { if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;cx+=x;cy+=y; }
cx=Math.round(cx/best.length); cy=Math.round(cy/best.length);
console.log(`瞳クラスタ: ${best.length}px, bbox x[${minX}-${maxX}] y[${minY}-${maxY}] 重心(${cx},${cy})`);

// 目全体のbbox（瞳を中心に少し広げて虹彩・まぶた縁を含める）
const eye = {
  x: minX - 4, y: minY - 4,
  w: (maxX - minX + 1) + 8, h: (maxY - minY + 1) + 8,
};
console.log('目bbox(余白込み):', JSON.stringify(eye));

// 検証：赤枠を重ねて出力
const vis = crop(f0, 0, 0, FW, f0.height);
function setpx(im,x,y,c){const i=(y*im.width+x)*4;im.data[i]=c[0];im.data[i+1]=c[1];im.data[i+2]=c[2];im.data[i+3]=255;}
for (let x = eye.x; x < eye.x + eye.w; x++) { setpx(vis,x,eye.y,[255,0,0]); setpx(vis,x,eye.y+eye.h-1,[255,0,0]); }
for (let y = eye.y; y < eye.y + eye.h; y++) { setpx(vis,eye.x,y,[255,0,0]); setpx(vis,eye.x+eye.w-1,y,[255,0,0]); }
function up(im,s){const W=im.width*s,H=im.height*s,d=Buffer.alloc(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const si=((y/s|0)*im.width+(x/s|0))*4,di=(y*W+x)*4;im.data.copy(d,di,si,si+4);}return{width:W,height:H,data:d};}
encode('tools/_eye/detect.png', up(crop(vis, eye.x-25, eye.y-25, 80, 70), 5));
console.log('検証画像: tools/_eye/detect.png');
