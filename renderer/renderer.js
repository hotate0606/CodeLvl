// ===== CodeLv: たまごっき風プロトタイプ =====
// 部屋とキャラをドット絵としてコードで直接描画する。
// 論理解像度 80x64 → 4倍拡大で 320x256 のcanvasに表示。

const LOGICAL_W = 80;
const LOGICAL_H = 64;
const SCALE     = 4;

// 画角ズーム：部屋・ペット・演出すべてに均一に効く。ペットの足元を中心に寄せるので
// 拡大してもペットは接地したまま。1.0=等倍、上げるほど寄る（余白が減る）。
const SCENE_ZOOM = 1.15;

const view = document.getElementById('scene');
const vctx = view.getContext('2d');

// 表示サイズ（CSS論理px）＝見た目の大きさ。これは変えない。
const VIEW_W = view.width;   // 320
const VIEW_H = view.height;  // 256

// 高DPI対応：見た目サイズは VIEW_W×VIEW_H のまま、裏のキャンバスを DPR 倍の
// 物理解像度にして描く。これでにじみが取れて実質さらに細かく表示できる。
const DPR = Math.min(window.devicePixelRatio || 1, 3); // 過大な裏キャンバスを避けるため上限3
view.width  = Math.round(VIEW_W * DPR);
view.height = Math.round(VIEW_H * DPR);
view.style.width  = VIEW_W + 'px';   // 表示は等倍に固定（CSSでも固定済みだが明示）
view.style.height = VIEW_H + 'px';

// 部屋・家具・演出の描画解像度倍率（ドットの細かさ）。物理解像度に合わせる（=4*DPR）。
// 座標系は今までどおり論理80×64のまま。SS を上げるほど 1/SS 単位の小さなドットが置ける。
const SS = 4 * DPR;
vctx.imageSmoothingEnabled = false;

// ===== ゲッコー スプライト（画像ダウンサンプル方式）=====
// ソース解像度も DPR に合わせて上げ、高DPIでもキャラ/卵がくっきり表示されるようにする。
const GECKO_DOT_W = Math.round(110 * DPR);
const DOT_SCALE   = 2;

function keepLargestComponent(d, w, h) {
  const vis = new Uint8Array(w * h);
  const components = [];
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const idx = sy * w + sx;
      if (vis[idx] || d[idx * 4 + 3] < 30) { vis[idx] = 1; continue; }
      const pixels = [], stk = [idx];
      while (stk.length) {
        const p = stk.pop();
        if (p < 0 || p >= w * h || vis[p]) continue;
        vis[p] = 1;
        if (d[p * 4 + 3] < 30) continue;
        pixels.push(p);
        const px = p % w, py = (p / w) | 0;
        if (px > 0) stk.push(p-1); if (px < w-1) stk.push(p+1);
        if (py > 0) stk.push(p-w); if (py < h-1) stk.push(p+w);
      }
      if (pixels.length > 0) components.push(pixels);
    }
  }
  if (components.length === 0) return;
  const largest = components.reduce((a, b) => a.length > b.length ? a : b);
  const keep = new Uint8Array(w * h);
  for (const p of largest) keep[p] = 1;
  for (let p = 0; p < w * h; p++) if (!keep[p]) d[p * 4 + 3] = 0;
}

function floodFillTransparent(d, w, h, seeds, tol) {
  for (const [sx, sy] of seeds) {
    const si = (sy * w + sx) * 4;
    if (d[si + 3] === 0) continue;
    const r = d[si], gg = d[si+1], b = d[si+2];
    const vis = new Uint8Array(w * h);
    const stk = [sx, sy];
    while (stk.length) {
      const y = stk.pop(), x = stk.pop();
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const idx = y * w + x;
      if (vis[idx]) continue;
      vis[idx] = 1;
      const i = idx * 4;
      if (d[i+3] === 0) { stk.push(x-1,y, x+1,y, x,y-1, x,y+1); continue; }
      const dr=d[i]-r, dg=d[i+1]-gg, db=d[i+2]-b;
      if (dr*dr + dg*dg + db*db <= tol*tol) { d[i+3]=0; stk.push(x-1,y, x+1,y, x,y-1, x,y+1); }
    }
  }
}

function makeDotSprite(img, crop, dotW, { bgTol = 70 } = {}) {
  const cw = crop.x1-crop.x0, ch = crop.y1-crop.y0;
  const full = document.createElement('canvas');
  full.width = cw; full.height = ch;
  const fc = full.getContext('2d');
  fc.imageSmoothingEnabled = false;
  fc.drawImage(img, crop.x0, crop.y0, cw, ch, 0, 0, cw, ch);
  const fid = fc.getImageData(0, 0, cw, ch);
  const fd  = fid.data;
  floodFillTransparent(fd, cw, ch, [[0,0],[cw-1,0],[0,ch-1],[cw-1,ch-1]], bgTol);
  keepLargestComponent(fd, cw, ch);
  fc.putImageData(fid, 0, 0);
  let minX=cw, minY=ch, maxX=-1, maxY=-1;
  for (let y=0; y<ch; y++) for (let x=0; x<cw; x++) {
    if (fd[(y*cw+x)*4+3] > 0) {
      if (x<minX) minX=x; if (x>maxX) maxX=x;
      if (y<minY) minY=y; if (y>maxY) maxY=y;
    }
  }
  if (maxX < 0) return full;
  const bw=maxX-minX+1, bh=maxY-minY+1;
  const dotH = Math.max(1, Math.round(bh*dotW/bw));
  const out = document.createElement('canvas');
  out.width=dotW; out.height=dotH;
  const oc = out.getContext('2d');
  oc.imageSmoothingEnabled = true;
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(full, minX, minY, bw, bh, 0, 0, dotW, dotH);
  return out;
}

// idle はベースカラー3色（green/blue/gold）をパレット別に進化段階別で保持。
// yawn[stage][pal] はステージ別あくびモーション（0=ベビー7コマ, 1=進化7コマ, 2=最終進化10コマ）。
// idleAnim[stage][pal] は待機アニメ（現状は最終進化のみ。あれば静止idleより優先）。
const palSet = () => ({
  green: { frames: [], refW: 0 },
  blue:  { frames: [], refW: 0 },
  gold:  { frames: [], refW: 0 },
});
const dotFrames = {
  gecko: {
    idle: { green: [], blue: [], gold: [] },
    yawn: [palSet(), palSet(), palSet()],
    idleAnim: [palSet(), null, palSet()],
  },
  // スライム（将来の種族。ゲーム側の選択ロジックは未実装、素材のみ先行ロード）
  slime: {
    idleAnim: {
      pink:  { frames: [], refW: 0 },
      blue:  { frames: [], refW: 0 },
      green: { frames: [], refW: 0 },
    },
  },
};

// 現ステージ（0..2にクランプ）のあくびセットを返す
function yawnSetFor(stage, pal) {
  const byStage = dotFrames.gecko.yawn[Math.min(stage, dotFrames.gecko.yawn.length - 1)];
  return byStage ? byStage[pal] : null;
}

function loadDotSprite(src, target, index = 0, dotW = GECKO_DOT_W, bgTol = 50) {
  const img = new Image();
  img.onload = () => {
    const crop = { x0: 0, y0: 0, x1: img.naturalWidth, y1: img.naturalHeight };
    target[index] = makeDotSprite(img, crop, dotW, { bgTol });
  };
  img.src = src;
}

// idle[pal] は進化段階で索引: [0]=ベビー, [1]=進化後
// 3・進化３（gold）が生成原本。1・2／進化１・進化２は tools/recolor.html で
// goldから色替え生成したもの（柄・構図・ポーズは全色共通＝モーションと完全に揃う）。
// goldも同ツールのパレット再構成（自身のクラスタ色）を通してあり、質感が3色で統一。
// 加工前のAI生成原本はgit履歴を参照。
// stage 0（ベビー）: 1→green, 2→blue, 3→gold
loadDotSprite('./assets/ニシアフ/ニシアフリカトカゲモドキ1.png',     dotFrames.gecko.idle.green);
loadDotSprite('./assets/ニシアフ/ニシアフリカトカゲモドキ2.png',     dotFrames.gecko.idle.blue);
loadDotSprite('./assets/ニシアフ/ニシアフリカトカゲモドキ3.png',     dotFrames.gecko.idle.gold);
// stage 1（進化後）: 進化１→green, 進化２→blue, 進化３→gold（番号＝個体が一致）
loadDotSprite('./assets/ニシアフ/ニシアフリカトカゲモドキ進化１.png', dotFrames.gecko.idle.green, 1);
loadDotSprite('./assets/ニシアフ/ニシアフリカトカゲモドキ進化２.png', dotFrames.gecko.idle.blue,  1);
loadDotSprite('./assets/ニシアフ/ニシアフリカトカゲモドキ進化３.png', dotFrames.gecko.idle.gold,  1);
// 卵（孵化前）: ドット絵。eggDot[0]
const eggDot = [];
loadDotSprite('./assets/たまご１.png', eggDot);

// ===== モーション用スプライトシート切り出し =====
// cols×rows のグリッドから先頭 count コマを切り出す。各コマは makeDotSprite と同じ
// 背景flood-fill除去＋最大連結成分抽出を行い、実体のバウンディングボックスを求める。
//
// サイズ安定化のキモ：全コマを「コマ0の体幅 → dotW」の共通スケールで拡縮し、さらに
// 全コマ同一サイズの共通キャンバスへ「足元(下端)ぞろえ＋体の中心で横ぞろえ」して焼き込む。
// これで各コマの画像サイズ・体の位置が完全に一致し、再生中にサイズがブレない
// （口開け・頭の反りは上方向の余白に広がるだけ）。
// target = { frames:[canvas(同一サイズ)...], refW }（refW = コマ0の体幅px。idle体幅合わせ用）
function buildSheetFrames(img, cols, rows, count, target, dotW, bgTol) {
  const cw = Math.floor(img.naturalWidth  / cols);
  const ch = Math.floor(img.naturalHeight / rows);
  const inset = 4; // セル境界のグリッド線を避けて少し内側を切る
  const processed = [];

  for (let i = 0; i < count; i++) {
    const gx = i % cols, gy = (i / cols) | 0;
    const x0 = gx * cw + inset, y0 = gy * ch + inset;
    const w  = cw - inset * 2,  h  = ch - inset * 2;
    const c  = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
    const id = cx.getImageData(0, 0, w, h);
    const d  = id.data;
    floodFillTransparent(d, w, h, [[0,0],[w-1,0],[0,h-1],[w-1,h-1]], bgTol);
    keepLargestComponent(d, w, h);
    cx.putImageData(id, 0, 0);
    // 実体のバウンディングボックスと不透明面積
    let minX = w, minY = h, maxX = -1, maxY = -1, area = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y*w+x)*4+3] > 0) {
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
        if (d[(y*w+x)*4+3] > 30) area++;
      }
    }
    processed.push({ canvas: c, minX, minY, bw: maxX-minX+1, bh: maxY-minY+1, area: area || 1 });
  }
  if (!processed.length || processed[0].bw <= 0) return;

  // 共通スケール：コマ0の体幅を dotW にマップ。
  // さらにAI生成シートはコマ間で素体サイズ自体がブレる（最大±10%）ため、
  // 各コマを「体の面積√がコマ0と一致する」よう個別に正規化する。
  // 面積はポーズ差（口開け・翼）にほぼ不変なので、体格だけが揃い動きは保たれる。
  const scale = dotW / processed[0].bw;
  for (const p of processed) p.fscale = scale * Math.sqrt(processed[0].area / p.area);

  // 共通キャンバスのサイズ：最も大きく広がるコマに合わせる（頭の反り分の縦余白も確保）。
  let maxSW = 0, maxSH = 0;
  for (const p of processed) {
    maxSW = Math.max(maxSW, p.bw * p.fscale);
    maxSH = Math.max(maxSH, p.bh * p.fscale);
  }
  const outW = Math.ceil(maxSW) + 2;
  const outH = Math.ceil(maxSH) + 2;

  const frames = processed.map((p) => {
    const sw = p.bw * p.fscale, sh = p.bh * p.fscale;
    const o  = document.createElement('canvas');
    o.width = outW; o.height = outH;
    const oc = o.getContext('2d');
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    // 足元(下端)ぞろえ＋体の中心で横ぞろえ → コマ間で位置・大きさが固定される
    const dx = (outW - sw) / 2;
    const dy = outH - sh;
    oc.drawImage(p.canvas, p.minX, p.minY, p.bw, p.bh, dx, dy, sw, sh);
    return o;
  });

  target.frames = frames;
  target.refW   = Math.round(processed[0].bw * scale); // コマ0の体幅(px)。idle体幅合わせの基準
}

function loadSheet(src, target, { cols = 3, rows = 3, count, dotW = GECKO_DOT_W, bgTol = 70 }) {
  const img = new Image();
  img.onload = () => buildSheetFrames(img, cols, rows, count ?? cols * rows, target, dotW, bgTol);
  img.src = src;
}

// ベビーあくび（3×3グリッドの先頭7コマ）。goldが生成原本。1（green）・2（blue）は
// tools/recolor.html でgoldから色替えした透過シート（構図・コマは原本と完全一致）。
loadSheet('./assets/モーション/ニシアフモーション（あくび）.png',
          dotFrames.gecko.yawn[0].gold, { cols: 3, rows: 3, count: 7 });
loadSheet('./assets/モーション/ニシアフモーション（あくび）1.png',
          dotFrames.gecko.yawn[0].green, { cols: 3, rows: 3, count: 7 });
loadSheet('./assets/モーション/ニシアフモーション（あくび）2.png',
          dotFrames.gecko.yawn[0].blue, { cols: 3, rows: 3, count: 7 });

// 進化・最終進化のモーション：3色混載シートを tools/process-sheets.html で
// 行分割・透過化・パレット再構成（白系γ1.35/goldγ1.20）した1行シート。番号は 1=green, 2=blue, 3=gold。
loadSheet('./assets/モーション/ニシアフ進化あくび1.png', dotFrames.gecko.yawn[1].green, { cols: 7,  rows: 1, count: 7 });
loadSheet('./assets/モーション/ニシアフ進化あくび2.png', dotFrames.gecko.yawn[1].blue,  { cols: 7,  rows: 1, count: 7 });
loadSheet('./assets/モーション/ニシアフ進化あくび3.png', dotFrames.gecko.yawn[1].gold,  { cols: 7,  rows: 1, count: 7 });
loadSheet('./assets/モーション/ニシアフ最終進化あくび1.png', dotFrames.gecko.yawn[2].green, { cols: 10, rows: 1, count: 10 });
loadSheet('./assets/モーション/ニシアフ最終進化あくび2.png', dotFrames.gecko.yawn[2].blue,  { cols: 10, rows: 1, count: 10 });
loadSheet('./assets/モーション/ニシアフ最終進化あくび3.png', dotFrames.gecko.yawn[2].gold,  { cols: 10, rows: 1, count: 10 });
loadSheet('./assets/モーション/ニシアフ最終進化待機1.png', dotFrames.gecko.idleAnim[2].green, { cols: 11, rows: 1, count: 11 });
loadSheet('./assets/モーション/ニシアフ最終進化待機2.png', dotFrames.gecko.idleAnim[2].blue,  { cols: 11, rows: 1, count: 11 });
loadSheet('./assets/モーション/ニシアフ最終進化待機3.png', dotFrames.gecko.idleAnim[2].gold,  { cols: 11, rows: 1, count: 11 });

// ベビー待機（6コマ。行=色の混載シートを分割→シームレス化のため孤立コマを除き並べ替え済み。1=green/2=blue/3=gold）
loadSheet('./assets/モーション/ニシアフ待機1.png', dotFrames.gecko.idleAnim[0].green, { cols: 6, rows: 1, count: 6 });
loadSheet('./assets/モーション/ニシアフ待機2.png', dotFrames.gecko.idleAnim[0].blue,  { cols: 6, rows: 1, count: 6 });
loadSheet('./assets/モーション/ニシアフ待機3.png', dotFrames.gecko.idleAnim[0].gold,  { cols: 6, rows: 1, count: 6 });

// スライム待機（青が原本、ピンク・緑は各色イラストのパレットへ変換済み）
loadSheet('./assets/モーション/スライム待機青.png',     dotFrames.slime.idleAnim.blue,  { cols: 7, rows: 1, count: 7 });
loadSheet('./assets/モーション/スライム待機ピンク.png', dotFrames.slime.idleAnim.pink,  { cols: 7, rows: 1, count: 7 });
loadSheet('./assets/モーション/スライム待機緑.png',     dotFrames.slime.idleAnim.green, { cols: 7, rows: 1, count: 7 });

const EGG_DRAW_W = 60; // 卵の描画幅(px)。部屋全体とのバランスで調整

// オフスクリーン（論理解像度）に描いてから拡大する
const off = document.createElement('canvas');
off.width  = Math.round(LOGICAL_W * SS);   // 実ピクセルは SS 倍。描画時に g を SS 倍スケールするので座標は論理のまま
off.height = Math.round(LOGICAL_H * SS);
const g = off.getContext('2d');

// アイソメ部屋のラグ中央付近にペットが立つ。ISO.SIDEY〜ISO.FRONTY の中間帯を床面とする。
const FLOOR_Y = 46; // 論理px。アイソメの床（ラグの上あたり）

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ===== エモート（あくび等）は廃止 =====
// モーションは後日スプライト生成方式で付ける予定。

// ---- 小物描画ヘルパ ----
// 論理座標で矩形を描く。SS により 1/SS 単位の小数座標も使える（細かいドット）。
function px(x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

const HEART = ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'];
const SPARK = ['..X..', '..X..', 'XXXXX', '..X..', '..X..'];

function drawPattern(pat, ox, oy, color) {
  for (let y = 0; y < pat.length; y++) {
    for (let x = 0; x < pat[y].length; x++) {
      if (pat[y][x] !== '.') {
        g.fillStyle = color;
        g.fillRect((ox + x) | 0, (oy + y) | 0, 1, 1);
      }
    }
  }
}

// ---- 部屋（アイソメトリック：2枚の壁が中央で合わさる斜め俯瞰）----
// 中央の縦エッジで左右の壁が合わさり、床はひし形に広がる。外側は透明（カードが透ける）。
// 画角を近づける＝部屋を画面外まで広げて余白を縮める（端は少しはみ出してクロップ）。
const ISO = { CX: 40, TOPY: -2, BACKY: 22, SIDETOPY: 20, LX: -10, RX: 90, SIDEY: 44, FRONTY: 66 };
function drawRoom() {
  const { CX, TOPY, BACKY, SIDETOPY, LX, RX, SIDEY, FRONTY } = ISO;
  const HW = CX - LX;             // 壁/床の横半幅
  const RISE = SIDETOPY - TOPY;   // アイソメの傾き（横HWあたりの縦上がり）
  const STEP = 0.25;
  const Y0 = Math.max(0, TOPY);   // 画面上端でクロップ
  const row = (y, x0, x1, c) => { if (x1 > x0) px(x0, y, x1 - x0, STEP, c); };
  const wallTopL = y => CX - HW * (y - TOPY) / RISE;
  const wallTopR = y => CX + HW * (y - TOPY) / RISE;
  const seamL = y => CX - HW * (y - BACKY) / RISE;
  const seamR = y => CX + HW * (y - BACKY) / RISE;
  const frontL = y => LX + HW * (y - SIDEY) / RISE;
  const frontR = y => RX - HW * (y - SIDEY) / RISE;
  const WL = '#d6ebdc', WR = '#c7ddce', FLOOR = '#b07d4f';

  // 壁2枚＋床ひし形（行ごとにスパンを塗る）
  for (let y = Y0; y < FRONTY; y += STEP) {
    if (y < SIDETOPY)   { row(y, wallTopL(y), CX, WL); row(y, CX, wallTopR(y), WR); }
    else if (y < BACKY) { row(y, LX, CX, WL); row(y, CX, RX, WR); }
    else if (y < SIDEY) { const sL = seamL(y), sR = seamR(y); row(y, LX, sL, WL); row(y, sL, sR, FLOOR); row(y, sR, RX, WR); }
    else                { row(y, frontL(y), frontR(y), FLOOR); }
  }

  // 床板（右下方向に走る線。床ひし形内に収まる）
  const plank = (u, c) => { const x0 = CX - HW * u, y0 = BACKY + RISE * u, x1 = x0 + HW, y1 = y0 + RISE, n = 300; for (let i = 0; i <= n; i++) { const t = i / n; px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.5, 0.5, c); } };
  for (let k = 1; k < 10; k++) plank(k / 10, '#8a5d39');

  // 巾木（奥の2辺）＋ コーナー＋壁の輪郭
  for (let y = BACKY; y < SIDEY; y += STEP) { px(seamL(y) - 0.3, y, 0.7, STEP, '#7a5333'); px(seamR(y) - 0.4, y, 0.7, STEP, '#5e4028'); }
  px(CX - 0.25, Y0, 0.5, BACKY - Y0, '#bcdac8');
  for (let y = Y0; y < SIDETOPY; y += STEP) { px(wallTopL(y) - 0.3, y, 0.6, STEP, '#b8d4c2'); px(wallTopR(y) - 0.3, y, 0.6, STEP, '#aeccbb'); }

  // ラグ（床のひし形）
  const diamond = (cx, cy, hw, hh, c) => { for (let y = cy - hh; y < cy + hh; y += STEP) { const t = 1 - Math.abs(y - cy) / hh; const w = hw * t; px(cx - w, y, w * 2, STEP, c); } };
  diamond(40, 51, 26, 12, '#cdd8e0'); diamond(40, 51, 22, 10, '#dde6ec');

  // 壁オブジェ（縦ストリップで壁の傾きに沿わせた平行四辺形）
  const wallStripR = (f0, f1, top, h, c) => { for (let f = f0; f <= f1; f += 0.004) { const x = CX + HW * f, yt = TOPY + RISE * f + top; px(x, yt, 0.5, h, c); } };
  const wallStripL = (f0, f1, top, h, c) => { for (let f = f0; f <= f1; f += 0.004) { const x = CX - HW * f, yt = TOPY + RISE * f + top; px(x, yt, 0.5, h, c); } };
  const disc = (cx, cy, r, c) => { for (let y = cy - r; y < cy + r; y += STEP) { const w = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy))); px(cx - w, y, w * 2, STEP, c); } };

  // 左壁：エアコン＋時計
  wallStripL(0.52, 0.84, 6, 4, '#e9f1f0'); wallStripL(0.52, 0.84, 6, 1, '#cfdcdb');
  disc(20, 12, 3, '#dfe7ea'); disc(20, 12, 2.3, '#ffffff'); px(20, 10, 0.4, 2, '#556'); px(20, 12, 1.4, 0.4, '#556');

  // 右壁：窓
  wallStripR(0.32, 0.8, 5, 13, '#33414f');
  wallStripR(0.35, 0.77, 6.4, 10.2, '#9fd2ec');
  wallStripR(0.56, 0.565, 6.4, 10.2, '#33414f');
  for (let f = 0.35; f <= 0.77; f += 0.004) { const x = CX + HW * f; px(x, TOPY + RISE * f + 11.4, 0.5, 0.5, '#33414f'); }
}

// 棚（家具）：細グリッド（0.25論理単位 = sp 1マス）で作り込んだ木製本棚。
// 設置原点(論理) OX,OY。設置範囲は約 16×16 論理px（= sp 64×64マス）。床=FLOOR_Y。
function drawShelf() {
  const OX = 3, OY = 42, U = 0.25; // 手前左の床に設置
  const sp = (x, y, w, h, c) => px(OX + x * U, OY + y * U, w * U, h * U, c);

  // 影
  sp(5, 62, 54, 2, '#34271d');
  // 脚
  sp(5, 59, 8, 4, '#4a3526'); sp(51, 59, 8, 4, '#4a3526');
  // 外枠＋ベベル
  sp(2, 2, 60, 58, '#4a3526');      // 本体（濃）
  sp(4, 4, 56, 54, '#7a5836');      // 面（中木）
  sp(4, 4, 56, 2, '#a8814f');       // 上ハイライト
  sp(4, 4, 2, 54, '#9a7344');       // 左ハイライト
  sp(58, 4, 2, 54, '#3a2a1d');      // 右シャドウ
  sp(4, 56, 56, 2, '#3a2a1d');      // 下シャドウ
  // 奥の凹み＋木目
  sp(7, 7, 50, 49, '#2c2118');
  for (let i = 0; i < 5; i++) sp(11 + i * 9, 7, 0.5, 49, '#332619');
  // 棚板2枚
  for (const by of [23, 39]) { sp(7, by, 50, 3, '#7a5836'); sp(7, by, 50, 1, '#9a7a4a'); sp(7, by + 2, 50, 1, '#1f1610'); }

  // ===== 上段：本＋積み本＋地球儀 =====
  const book = (x, w, top, base, hi) => {
    const h = 23 - top;
    sp(x, top, w, h, base); sp(x, top, 1, h, hi); sp(x + w - 1, top, 1, h, '#1f140e');
    sp(x, top, w, 1, '#e8dcc0'); sp(x, top + Math.round(h * 0.45), w, 1, hi);
  };
  book(9, 4, 8, '#a23f33', '#cf5f4d');
  book(13, 3, 6, '#b08a2e', '#e6c452');
  book(16, 4, 9, '#2f6f96', '#4a9ec0');
  book(20, 3, 8, '#3f8f55', '#5fc878');
  book(23, 4, 7, '#7a5a9a', '#a87ec0');
  book(27, 3, 9, '#a23f33', '#cf5f4d');
  // 横積み本
  sp(37, 19, 16, 4, '#7a8f5a'); sp(37, 19, 16, 1, '#9fb87a');
  sp(38, 16, 14, 3, '#5a8fb0'); sp(38, 16, 14, 1, '#82b0d0');
  sp(39, 13, 12, 3, '#b06a8a'); sp(39, 13, 12, 1, '#d895b0');
  // 地球儀
  sp(45, 7, 8, 8, '#3a7d9a'); sp(46, 6, 6, 1, '#3a7d9a'); sp(46, 15, 6, 1, '#3a7d9a');
  sp(47, 9, 2, 3, '#7fc0d8'); sp(50, 11, 2, 2, '#7fc0d8'); sp(48, 7, 3, 1, '#2c6076');
  sp(48, 15, 2, 3, '#8a6240');

  // ===== 中段：額＋時計＋鉢植え =====
  sp(9, 28, 12, 9, '#caa45a'); sp(11, 30, 8, 5, '#7ec8e3'); sp(11, 33, 8, 2, '#5fae68'); sp(12, 31, 2, 1, '#ffffff');
  sp(25, 27, 10, 10, '#8a6240'); sp(26, 28, 8, 8, '#ece4cc'); sp(30, 29, 1, 4, '#3a2a1d'); sp(30, 31, 3, 1, '#3a2a1d'); sp(29, 32, 1, 1, '#a23f33');
  sp(41, 32, 9, 5, '#9c6b44'); sp(40, 31, 11, 1, '#b07c50'); sp(42, 32, 7, 1, '#2c2118');
  sp(44, 26, 1, 6, '#3f8f55'); sp(42, 27, 2, 2, '#4fae68'); sp(46, 27, 3, 2, '#5fc878'); sp(45, 24, 2, 2, '#5fc878');

  // ===== 下段：引き出し＋小瓶＋ティーポット =====
  sp(9, 43, 20, 11, '#8a5e3a'); sp(9, 43, 20, 1, '#a8744a'); sp(9, 53, 20, 1, '#3a2a1d');
  sp(18, 43, 1, 11, '#5e4028');
  sp(13, 47, 2, 2, '#2f2118'); sp(22, 47, 2, 2, '#2f2118');
  sp(31, 45, 6, 9, '#b58fe0'); sp(31, 46, 1, 8, '#dcc4f5'); sp(32, 43, 4, 2, '#8a6240');
  sp(41, 47, 12, 7, '#b5604a'); sp(42, 46, 10, 1, '#c87a60'); sp(45, 44, 4, 2, '#b5604a'); sp(46, 43, 2, 1, '#caa45a');
  sp(52, 48, 3, 3, '#b5604a'); sp(40, 49, 2, 3, '#9a4a38'); sp(43, 48, 2, 2, '#d89580');
}

// 部屋は静的なので一度だけ描いてキャッシュし、毎フレームはこれを貼る（負荷対策）。
const roomCanvas = document.createElement('canvas');
roomCanvas.width = off.width; roomCanvas.height = off.height;
const roomCtx = roomCanvas.getContext('2d');
function buildRoomCache() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, off.width, off.height);   // 部屋の外側は透明にする
  g.setTransform(SS, 0, 0, SS, 0, 0);
  g.imageSmoothingEnabled = false;
  drawRoom();
  roomCtx.clearRect(0, 0, roomCanvas.width, roomCanvas.height);
  roomCtx.drawImage(off, 0, 0);
}

// ===== キャラ素材（ハイブリッド：今はコード描画、将来スプライト差し替え）=====
const SPRITES = {
  slime: {
    stages: [
      { scale: 0.78 },
      { scale: 1.0  },
      { scale: 1.2  },
      { scale: 1.42 },
    ],
  },
  gecko: {
    stages: [
      { scale: 0.85 }, // ベビー（静止idle＋あくび7コマ）
      { scale: 1.0  }, // 進化（あくび7コマ。idleはあくびコマ0を使用）
      { scale: 1.25 }, // 最終進化（待機アニメ11コマ＋あくび10コマ）
    ],
  },
};

const PALETTES = {
  green:  { body: '#7ad0a0', hi: '#a8f0c0', sh: '#4ca87a' },
  blue:   { body: '#6ec8e0', hi: '#a8e8f5', sh: '#3f9ab5' },
  gold:   { body: '#f0c060', hi: '#ffe49a', sh: '#c89030' },
  purple: { body: '#c79ae8', hi: '#e6c8ff', sh: '#9a6fc0' },
  rose:   { body: '#f09ab8', hi: '#ffc8dc', sh: '#c06a88' },
  aqua:   { body: '#6ee0c8', hi: '#a8f5e6', sh: '#3fb59a' },
  shadow: { body: '#5a5470', hi: '#8a82a8', sh: '#3a3550' },
};

function getPalette(name) { return PALETTES[name] || PALETTES.green; }

// ===== 突然変異（3%）：プラチナ / 発光 / 宝石 の3タイプ × 各3変種 =====
// レア度：プラチナ(49%) ＜ 発光(34%) ＜ 宝石(17%)
const MUTATION_TABLE = [
  { type: 'platinum', weight: 49 },
  { type: 'glow',     weight: 34 },
  { type: 'jewel',    weight: 17 },
];

const MUTATION_STYLES = {
  platinum: { label: 'プラチナ', filter: 'grayscale(1) brightness(1.35) contrast(1.05)', color: '#dfe6f0' },
  glow:     { label: '発光',     color: '#ffd24a' }, // 金色の後光
  jewel:    { label: '宝石',     color: '#9ad8ff' }, // 頭上にダイヤ
};

// 重み付き抽選で type を返す（プラチナ49 / 発光34 / 宝石17）
function rollMutation() {
  const total = MUTATION_TABLE.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of MUTATION_TABLE) {
    if (r < t.weight) return t.type;
    r -= t.weight;
  }
  return 'platinum';
}

// 現在の変異スタイル（変異してなければ null）
function mutationStyle() {
  return mutationType ? MUTATION_STYLES[mutationType] : null;
}

// ---- キャラ描画はドット絵（dotFrames）に一本化。旧スライムのコード描画は削除済み ----

// ---- アニメーション状態 ----
let lastBlink = 0, nextBlinkGap = 2.5, blinking = false, blinkEnd = 0;
let happyEnd = 0;
let badEnd   = 0;
const hearts   = [];
const sparkles = [];

// ---- スプライト用アイドルアニメーション ----
const idleAnim = { nextTick: 0, tickEnd: 0, tickType: 0 };

// ---- あくびモーション（スプライト方式・全ステージ3色対応）----
// 数秒ごとに自発的にあくびを1サイクル再生する。タイムラインは大あくびのコマを
// 長めに見せて自然な“ふわぁ”感を出す。各 d は秒。peak のコマでブルブル震える。
const yawn = { active: false, start: 0, next: 0 };
const YAWN_TIMELINES = [
  { peak: 5, seq: [ // stage 0 ベビー（7コマ）
    { f: 0, d: 0.07 }, { f: 1, d: 0.08 }, { f: 2, d: 0.10 },
    { f: 3, d: 0.12 }, { f: 4, d: 0.17 }, { f: 5, d: 1.00 }, { f: 6, d: 0.14 },
  ]},
  { peak: 4, seq: [ // stage 1 進化（7コマ）
    { f: 0, d: 0.07 }, { f: 1, d: 0.08 }, { f: 2, d: 0.12 },
    { f: 3, d: 0.17 }, { f: 4, d: 1.00 }, { f: 5, d: 0.14 }, { f: 6, d: 0.10 },
  ]},
  { peak: 5, seq: [ // stage 2 最終進化（10コマ）
    { f: 0, d: 0.07 }, { f: 1, d: 0.08 }, { f: 2, d: 0.10 }, { f: 3, d: 0.12 },
    { f: 4, d: 0.15 }, { f: 5, d: 1.00 }, { f: 6, d: 0.20 },
    { f: 7, d: 0.12 }, { f: 8, d: 0.10 }, { f: 9, d: 0.08 },
  ]},
];
const yawnTimeline = stage => YAWN_TIMELINES[Math.min(stage, YAWN_TIMELINES.length - 1)];
const yawnTotal    = stage => yawnTimeline(stage).seq.reduce((s, k) => s + k.d, 0);

function yawnFrameAt(stage, elapsed) {
  const seq = yawnTimeline(stage).seq;
  let t = 0;
  for (const k of seq) { if (elapsed < t + k.d) return k.f; t += k.d; }
  return seq[seq.length - 1].f;
}

// 現在あくび中なら、表示すべきフレーム画像と基準幅を返す（でなければ null）。
function currentYawnSet() {
  if (!yawn.active) return null;
  const set = yawnSetFor(evolutionStage, currentPaletteName());
  if (!set || !set.frames.length || !set.refW) return null;
  const f = yawnFrameAt(evolutionStage, performance.now() / 1000 - yawn.start);
  const img = set.frames[f];
  return img ? { img, set, refW: set.refW, frame: f, peak: yawnTimeline(evolutionStage).peak } : null;
}

// キャンバスの不透明ピクセル数（結果はキャンバスにキャッシュ）。
// シートが違うとコマ0のbbox（尻尾の丸まり・翼の開き）が変わるため、bbox幅でなく
// 「体の面積」で待機⇔あくびの表示スケールを揃える（ポーズ差にほぼ不変）。
function canvasArea(c) {
  if (c.__area) return c.__area;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let p = 0; p < c.width * c.height; p++) if (d[p*4+3] > 30) n++;
  return (c.__area = n || 1);
}

// あくびのスケジューラ。素材があり待機状態のときだけ周期的に発火させる。
function updateYawn(now) {
  const set = yawnSetFor(evolutionStage, currentPaletteName());
  const avail = set && set.frames.length && set.refW &&
                bornPalette && !evoActive && !hatchActive;
  if (!avail) { yawn.active = false; return; }
  if (yawn.next === 0) yawn.next = now + 1.5 + Math.random() * 2; // 初回まで少し待つ（1.5〜3.5秒）
  if (!yawn.active && now >= yawn.next) { yawn.active = true; yawn.start = now; }
  if (yawn.active && (now - yawn.start) >= yawnTotal(evolutionStage)) {
    yawn.active = false;
    yawn.next = now + 3 + Math.random() * 4; // 次のあくびまで3〜7秒
  }
}

function getSpriteOffsets(now) {
  // 縦ゆれ（呼吸の上下動・小ジャンプ）は廃止。じっと待機する。
  // ごくわずかな傾きの揺れ（体重移動感）だけ残す。縦移動はしない。
  const microRot = Math.sin(now * 0.3) * 0.008;

  // 時々の小さなかしぎ（傾きのみ・縦移動なし、3〜8秒ごと）
  let actionRot = 0;
  if (now > idleAnim.nextTick) {
    idleAnim.nextTick = now + 3 + Math.random() * 5;
    idleAnim.tickEnd  = now + 0.45;
  }
  if (now < idleAnim.tickEnd) {
    const p = (idleAnim.tickEnd - now) / 0.45; // 1→0
    actionRot = Math.sin(p * Math.PI) * 0.07; // かしぎ
  }

  return { dy: 0, rot: microRot + actionRot };
}

const EVO_DUR = 3.0;
let evoActive = false, evoStart = 0, evoBurstDone = false;

// 孵化演出（卵が揺れる→光に包まれる→割れてベビー登場）
const HATCH_DUR = 2.2;
let hatchActive = false, hatchStart = 0, hatchBurstDone = false;

function startHatchEffect() {
  hatchActive    = true;
  hatchStart     = performance.now() / 1000;
  hatchBurstDone = false;
}

function triggerHappy() {
  happyEnd = performance.now() / 1000 + 1.2;
  for (let i = 0; i < 3; i++) {
    hearts.push({
      x: 40 + (Math.random() * 18 - 9), y: 30 + Math.random() * 6,
      vy: 8 + Math.random() * 6, vx: Math.random() * 4 - 2, life: 1.2,
    });
  }
}

function triggerBad() {
  badEnd = performance.now() / 1000 + 0.6;
}

function spawnSparkles() {
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 12 + Math.random() * 22;
    sparkles.push({ x: 40, y: 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.9 + Math.random() * 0.6 });
  }
}

function renderEvolution(now, p) {
  const cx = 40, feetY = FLOOR_Y + 7;
  let dark = p < 0.8 ? (p / 0.8) * 0.55 : Math.max(0, 0.55 * (1 - (p - 0.8) / 0.2));
  g.fillStyle = `rgba(4,5,12,${dark})`;
  g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

  // ※スライム（drawCreature）は描かない。光のエネルギー → 閃光 → 反映で演出する。
  if (p < 0.8) {
    // 変身エネルギー：足元中心に白い光球が徐々に強く脈動する
    const fp    = clamp(p / 0.8, 0, 1);
    const freq  = 6 + fp * 34;
    const pulse = (0.25 + 0.55 * fp) * (0.55 + 0.45 * Math.sin(now * freq));
    const r     = 8 + fp * 6 + Math.sin(now * freq) * 1.5;
    g.save();
    g.globalAlpha = clamp(pulse, 0, 1);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, feetY - 11, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  } else if (p < 0.9) {
    // 閃光＋きらめき
    if (!evoBurstDone) { spawnSparkles(); evoBurstDone = true; }
    const fa = 1 - Math.abs((p - 0.85) / 0.05);
    g.fillStyle = `rgba(255,255,255,${clamp(fa, 0, 1)})`;
    g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  } else {
    // 進化完了：ハートを出す（新しい姿は演出終了後にドット絵で表示）
    if (hearts.length < 2) {
      hearts.push({ x: cx + (Math.random() * 16 - 8), y: 28, vy: 8, vx: Math.random() * 3 - 1.5, life: 1.4 });
    }
  }
}

// 現在のキャラ（ベビー/進化後）を vctx に描く。alpha でフェードイン可。
function drawCreatureSprite(now, alpha = 1) {
  const pal   = currentPaletteName();
  const st    = activeStages()[Math.min(evolutionStage, activeStages().length - 1)];
  const baseW = 100 * st.scale; // 部屋全体とのバランスで調整
  const pivX = VIEW_W / 2, pivY = (FLOOR_Y + 8) * SCALE;
  const offs = getSpriteOffsets(now);

  // あくびモーション中なら専用フレームを使う（素材があるときのみ）。
  const yset = currentYawnSet();

  const stage = Math.min(evolutionStage, dotFrames.gecko.yawn.length - 1);

  let dotImg, dW, dH, anchorX, anchorY, shadowW;
  if (yset) {
    // 全コマ同一サイズの共通キャンバスなので、コマ間でサイズは全くブレない。
    // ただしシート間（待機⇔あくび）はコマ0のbboxが違う（尻尾・翼のポーズ差）ため、
    // bbox幅基準だとあくびの瞬間に一瞬大きくなる。そこで「体の面積」が待機表示と
    // 一致するスケールに補正する。待機基準がないステージはbbox幅基準にフォールバック。
    dotImg = yset.img;
    let scale = baseW / yset.refW;
    const ia = dotFrames.gecko.idleAnim[stage] && dotFrames.gecko.idleAnim[stage][pal];
    if (ia && ia.frames.length && ia.refW) {
      const si = baseW / ia.refW; // 待機アニメの表示スケール
      scale = si * Math.sqrt(canvasArea(ia.frames[0]) / canvasArea(yset.set.frames[0]));
    } else if (stage === 0) {
      const idleImg = dotFrames.gecko.idle[pal] && dotFrames.gecko.idle[pal][0];
      if (idleImg) {
        const si = baseW / idleImg.width; // 静止idleの表示スケール
        scale = si * Math.sqrt(canvasArea(idleImg) / canvasArea(yset.set.frames[0]));
      }
    } // stage 1 は待機＝あくびコマ0（同一シート）なので補正不要
    dW = dotImg.width * scale; dH = dotImg.height * scale;
    anchorX = dW / 2;   // キャンバス中心 = 体の中心X
    anchorY = dH;       // キャンバス下端 = 足元Y
    shadowW = baseW;    // 影は体幅基準で固定（口開け・尻尾で広がらない）
  } else {
    // 待機表示の優先順位：
    //   1) 待機アニメシート（最終進化）… ゆったりループ再生
    //   2) あくびシートのコマ0（進化以降）… モーションと柄・色が完全一致する
    //   3) 静止idle画像（ベビー、またはシート未ロード時のフォールバック）
    const ia = dotFrames.gecko.idleAnim[stage] && dotFrames.gecko.idleAnim[stage][pal];
    const ys = stage >= 1 ? yawnSetFor(stage, pal) : null;
    if (ia && ia.frames.length && ia.refW) {
      const IDLE_ANIM_FPS = 6; // 呼吸感のあるゆったりループ
      dotImg = ia.frames[Math.floor(now * IDLE_ANIM_FPS) % ia.frames.length];
      const scale = baseW / ia.refW;
      dW = dotImg.width * scale; dH = dotImg.height * scale;
      anchorX = dW / 2; anchorY = dH;
      shadowW = baseW;
    } else if (ys && ys.frames.length && ys.refW) {
      dotImg = ys.frames[0];
      const scale = baseW / ys.refW;
      dW = dotImg.width * scale; dH = dotImg.height * scale;
      anchorX = dW / 2; anchorY = dH;
      shadowW = baseW;
    } else {
      const frames = dotFrames.gecko.idle[pal];
      let idx = 0;
      if (frames) {
        idx = Math.min(evolutionStage, frames.length - 1);
        while (idx > 0 && !frames[idx]) idx--;
      }
      dotImg = (frames && frames[idx]) || dotFrames.gecko.idle.gold[0];
      if (!dotImg) return;
      const scale = baseW / dotImg.width;
      dW = dotImg.width * scale; dH = dotImg.height * scale;
      anchorX = dW / 2;  // 体の中心X
      anchorY = dH;      // 足元Y（画像の下端）
      shadowW = dW;
    }
  }

  // 影
  vctx.save();
  vctx.globalAlpha = 0.2 * alpha;
  vctx.fillStyle = '#1a1025';
  vctx.beginPath();
  vctx.ellipse(pivX, pivY, shadowW * 0.4, 5, 0, 0, Math.PI * 2);
  vctx.fill();
  vctx.restore();

  // 最大あくびのコマでは静止しつつ小刻みに震える「ブルブル」演出（本体のみ。影は固定）。
  let shakeX = 0, shakeY = 0, shakeRot = 0;
  if (yset && yset.frame === yset.peak) {
    shakeX   = Math.sin(now * 150) * 0.45;  // 横の小刻み（≒24Hz・速め）
    shakeY   = Math.sin(now * 174) * 0.22;  // 縦は控えめ
    shakeRot = Math.sin(now * 162) * 0.007; // ごく僅かな角度の震え
  }

  // 本体（縮小＋微回転で最近傍だと走査線が出るため高品質補間にする）
  vctx.save();
  vctx.globalAlpha = alpha;
  vctx.imageSmoothingEnabled = true;
  vctx.imageSmoothingQuality = 'high';
  vctx.translate(pivX + shakeX, pivY + offs.dy + shakeY);
  vctx.rotate(offs.rot * 0.5 + shakeRot);
  vctx.drawImage(dotImg, -anchorX, -anchorY, dW, dH);
  vctx.restore();
}

// 卵を vctx に描く（孵化前）。
function drawEggSprite(now) {
  const img = eggDot[0];
  if (!img) return;
  const dW = EGG_DRAW_W, dH = img.height * (EGG_DRAW_W / img.width);
  const pivX = VIEW_W / 2, pivY = (FLOOR_Y + 8) * SCALE;
  const offs = getSpriteOffsets(now);
  vctx.save();
  vctx.globalAlpha = 0.2;
  vctx.fillStyle = '#1a1025';
  vctx.beginPath();
  vctx.ellipse(pivX, pivY, dW * 0.4, 5, 0, 0, Math.PI * 2);
  vctx.fill();
  vctx.restore();
  vctx.save();
  vctx.imageSmoothingEnabled = true;
  vctx.imageSmoothingQuality = 'high';
  vctx.translate(pivX, pivY + offs.dy);
  vctx.rotate(offs.rot * 0.5);
  vctx.drawImage(img, -dW / 2, -dH, dW, dH);
  vctx.restore();
}

// 孵化演出（vctx に直接描く）。卵が光に溶けて消えると、ベビーがフェードインで現れる。
//   0.00-0.55 : 卵がガタガタ揺れる（だんだん激しく）
//   0.55-0.78 : 光が満ちて卵が薄れていく
//   0.70-0.90 : 閃光＋きらめき（割れる瞬間）
//   0.85-     : ハート（ベビー登場）
function renderHatch(now, p) {
  const img = eggDot[0];
  const pivX = VIEW_W / 2;
  const pivY = (FLOOR_Y + 8) * SCALE;
  const dW = img ? img.width  * (EGG_DRAW_W / img.width) : EGG_DRAW_W;
  const dH = img ? img.height * (EGG_DRAW_W / img.width) : EGG_DRAW_W;
  const glowCY = pivY - dH * 0.5;

  // フェーズごとの 揺れ / 光量 / 卵の不透明度
  let shakeX = 0, glow = 0, eggA = 1;
  if (p < 0.55) {
    const fp = p / 0.55;
    shakeX = Math.sin(now * 38) * (1 + fp * 5);
    glow   = fp * 0.35;
  } else if (p < 0.78) {
    const fp = (p - 0.55) / 0.23;
    shakeX = Math.sin(now * 60) * 4 * (1 - fp);
    glow   = 0.35 + fp * 0.65;
    eggA   = 1 - fp;            // 卵が光に溶ける
  } else {
    eggA = 0;
    glow = Math.max(0, 1 - (p - 0.78) / 0.22);
  }

  // 後光（白い放射グラデーション）
  if (glow > 0) {
    const r = dW * (0.7 + glow * 0.5);
    const grd = vctx.createRadialGradient(pivX, glowCY, 0, pivX, glowCY, r);
    grd.addColorStop(0,   'rgba(255,255,255,1)');
    grd.addColorStop(0.6, 'rgba(255,245,200,0.5)');
    grd.addColorStop(1,   'rgba(255,245,200,0)');
    vctx.save();
    vctx.globalAlpha = clamp(glow, 0, 1) * 0.85;
    vctx.fillStyle = grd;
    vctx.beginPath();
    vctx.arc(pivX, glowCY, r, 0, Math.PI * 2);
    vctx.fill();
    vctx.restore();
  }

  // 卵本体（揺れながら薄れる）
  if (img && eggA > 0.01) {
    vctx.save();
    vctx.globalAlpha = eggA;
    vctx.imageSmoothingEnabled = true;
    vctx.imageSmoothingQuality = 'high';
    vctx.translate(pivX + shakeX, pivY);
    vctx.drawImage(img, -dW / 2, -dH, dW, dH);
    vctx.restore();
  }

  // ベビーをフェードインで出す（閃光に隠れて入れ替わる）
  const babyA = clamp((p - 0.70) / 0.18, 0, 1);
  if (babyA > 0.01) drawCreatureSprite(now, babyA);

  // 閃光＋きらめき（割れる瞬間。卵→ベビーの切り替わりを覆って隠す）
  if (p >= 0.70 && p < 0.90) {
    if (!hatchBurstDone) { spawnSparkles(); hatchBurstDone = true; }
    const fa = 1 - Math.abs((p - 0.78) / 0.12);
    vctx.save();
    vctx.fillStyle = `rgba(255,255,255,${clamp(fa, 0, 1)})`;
    vctx.fillRect(0, 0, VIEW_W, VIEW_H);
    vctx.restore();
  }

  // 仕上げ：ハート
  if (p >= 0.85 && hearts.length < 2) {
    hearts.push({ x: 40 + (Math.random() * 16 - 8), y: 28, vy: 8, vx: Math.random() * 3 - 1.5, life: 1.4 });
  }
}

// ---- メインループ ----
let prev = performance.now() / 1000;

function frame() {
  const now = performance.now() / 1000;
  const dt  = now - prev;
  prev = now;

  if (!blinking && now - lastBlink > nextBlinkGap) { blinking = true; blinkEnd = now + 0.12; }
  if (blinking && now > blinkEnd) { blinking = false; lastBlink = now; nextBlinkGap = 2 + Math.random() * 3; }

  // キャッシュ済みの部屋を等倍で貼る（外側は透明）。その上にエフェクトを論理座標で描く。
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, off.width, off.height);
  g.drawImage(roomCanvas, 0, 0);
  g.setTransform(SS, 0, 0, SS, 0, 0);

  if (evoActive) {
    const p = clamp((now - evoStart) / EVO_DUR, 0, 1);
    renderEvolution(now, p);
    if (p >= 1) evoActive = false;
  }

  for (let i = hearts.length - 1; i >= 0; i--) {
    const h = hearts[i];
    h.y -= h.vy * dt; h.x += h.vx * dt; h.life -= dt;
    if (h.life <= 0) { hearts.splice(i, 1); continue; }
    drawPattern(HEART, h.x - 2, h.y - 2, '#ff5b7f');
  }

  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 14 * dt; s.life -= dt;
    if (s.life <= 0) { sparkles.splice(i, 1); continue; }
    drawPattern(SPARK, s.x - 2, s.y - 2, s.life > 0.5 ? '#ffffff' : '#ffe27a');
  }

  // 高DPI: 以降の vctx 描画は論理(VIEW_W×VIEW_H)座標で行い、DPR 倍で物理解像度へ。
  // まず等倍でクリアしてから、画角ズームを適用する。
  vctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  vctx.clearRect(0, 0, VIEW_W, VIEW_H);

  // 画角を寄せる：ペットの足元(zcx,zcy)を中心に均一ズーム。これ以降の vctx 描画
  // （部屋・ペット・孵化/進化演出）すべてに効くので、部屋とペットがズレない。
  const Z = SCENE_ZOOM, zcx = VIEW_W / 2, zcy = (FLOOR_Y + 8) * SCALE;
  vctx.setTransform(DPR * Z, 0, 0, DPR * Z, DPR * (zcx - Z * zcx), DPR * (zcy - Z * zcy));

  // 部屋を拡大してviewへ
  vctx.imageSmoothingEnabled = false;
  vctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, VIEW_W, VIEW_H);

  // あくびモーションのスケジューリング（素材があるときだけ周期発火）
  updateYawn(now);

  // キャラ／卵の描画（ドット絵）。進化・孵化演出中は専用描画に任せる。
  if (!evoActive && !hatchActive) {
    if (!bornPalette) drawEggSprite(now);        // 孵化前は卵
    else              drawCreatureSprite(now);   // 孵化後はキャラ（進化段階別／あくび中はモーション）
  }

  // 孵化演出：ベビーの上に卵を重ねて揺らし、光に溶けてベビーが現れる
  if (hatchActive) {
    const hp = clamp((now - hatchStart) / HATCH_DUR, 0, 1);
    renderHatch(now, hp);
    if (hp >= 1) hatchActive = false;
  }

  requestAnimationFrame(frame);
}

buildRoomCache();        // 静的な部屋を一度だけ描いてキャッシュ
requestAnimationFrame(frame);

// ---- ゲームパラメータ ----
const params = { condition: 80, affection: 60, hunger: 70, mood: 80 };

const PET_GAIN    = 20 / 3;
const EGG_AFFECTION_PER_COMMIT = 100 / 3; // 卵はコミット約3回でなつき度MAX→孵化
const MUTATION_RATE = 0.03;
const HATCH_COLORS  = ['green', 'blue', 'gold'];

let lastPetDate    = '';
let lastCommitDate = '';
let lastBadPetDate = ''; // 触られたくない場所をなでた最終日
let evolutionStage  = 0;
let mutationType    = null; // 'platinum' | 'glow' | 'jewel' | null
let bornPalette      = null;
let evolutionLocked      = false; // true のとき、なつき度MAXでも進化しない（たいかのアメ：トグル）
let evolutionHardLocked  = false; // true のとき、しんかのアメ以外では解除不可（せいちょうしたくないアメ）
let coins            = 30;
let coinPoolStart   = Date.now();

const COIN_UNIT_MS   = 10 * 60 * 1000;
let   coinPoolUnits  = 3;  // 最大ユニット数（拡張アイテムで最大5＝50分50コイン）
const COINS_PER_UNIT = 10;
const FOOD_COST      = 10;
const FEED_HUNGER    = 15;
const FEED_MOOD      = 12;
const PET_MOOD       = 5;
const BAD_TOUCH_PENALTY = 10; // 触られたくない場所のペナルティ（機嫌・状態 -10）

// 触られたくない場所（論理座標）：キャラ左下あたり
const DISLIKED_ZONE = { x: 27, y: 42, w: 12, h: 10 };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ---- キャラ定義 ----
const DIALOGUE = {
  cheerful: {
    needCommit:    ['まずコミットしよう！', 'コードかこ〜！'],
    notReady:      ['まだたまってないよ', 'もうちょっと まってね'],
    claim:         (n) => `+${n}🪙 うけとった！`,
    notEnoughCoin: ['コインが たりない…'],
    feed:          ['もぐもぐ♪', 'おいしい〜！', 'ごちそうさま！'],
    alreadyPet:    ['きょうは もう なでたよ', 'なでなで ありがと♪'],
    petUp:         ['なつき度アップ！', 'うれしいな〜♪', 'えへへ'],
    evolving:      ['✨ しんか ちゅう… ✨'],
    mutate:        () => {
      const s = mutationStyle();
      return s ? `✨ とつぜんへんい！ ${s.label}！ ✨` : '✨ とつぜんへんい！ ✨';
    },
    // コミット量による機嫌変化（xp: 獲得XP, boost: ブースト中か）
    hatch:         ['うまれたよ！', 'はじめまして〜！', 'よろしくね！'],
    commitBig:     (xp, boost) => `+${xp} XP！${boost ? '🔥' : ''} すごいっ！`,
    commitNormal:  (xp, boost) => `+${xp} XP！${boost ? '🔥' : ''} えらい！`,
    commitSmall:   (xp, boost) => `+${xp} XP… もうちょっとかいて？`,
    capReached:    ['きょうは もう じゅうぶん！', 'また あした がんばろう！'],
    badTouch:          ['そこは だめ！', 'やめてよ〜！', 'ぷんぷん！'],
    badTouchDone:      ['きょうは もう やだ'],
    evoUpUsed:         ['しんかした！！✨', 'へんしん〜！✨'],
    evoStopActivate:    ['このままでいる！🔒', 'まだしんかしたくない！🔒'],
    evoStopDeactivate:  ['ロックがとけたよ！', 'しんかしてもいいかも…'],
    evoHardLockOn:      ['ぜったいしんかしない！🍭🔒', 'しんかのアメじゃないとだめだよ！🔒'],
    evoHardLockAlready: ['もうかかってるよ！', 'まだとけてないよ！'],
    evoHardLockBlocked: ['しんかのアメでしかとかせないよ！🔐', 'そのアメじゃとかせない…🔐'],
    evoLocked:          ['しんかしたくないの！🔒', 'まだこのままでいたい！🔒'],
    evoAlreadyMax:      ['もう さいこうけいたいだよ！', 'これいじょう しんかできない！'],
    evoNotBorn:         ['まだ たまごだよ！', 'うまれてないよ！'],
  },
};

// キャラ定義：スプライト×パレット×性格 ＋ 将来対応フィールド
const CHARACTERS = {
  gecko_green: {
    name: 'きいろん', sprite: 'gecko', palette: 'green', personality: 'cheerful',
    decayRates:   null,
    dislikedZone: null,
  },
  gecko_blue: {
    name: 'ももこ', sprite: 'gecko', palette: 'blue', personality: 'cheerful',
    decayRates:   null,
    dislikedZone: null,
  },
  gecko_gold: {
    name: 'くろすけ', sprite: 'gecko', palette: 'gold', personality: 'cheerful',
    decayRates:   null,
    dislikedZone: null,
  },
};

let activeChar = 'gecko_green'; // デフォルト（hatch後に bornPaletteで上書き）

// bornPaletteに合わせてアクティブキャラを選択
function updateActiveChar() {
  if (!bornPalette) return;
  const key = `gecko_${bornPalette}`;
  activeChar = CHARACTERS[key] ? key : 'gecko_green';
}

function activeCharData()    { return CHARACTERS[activeChar]; }
function activeStages()      { return SPRITES[activeCharData().sprite].stages; }
function currentPaletteName(){ return bornPalette || activeCharData().palette; }

function say(event, ...args) {
  const set  = DIALOGUE[activeCharData().personality];
  let line = set && set[event];
  if (typeof line === 'function') line = line(...args);
  else if (Array.isArray(line))   line = line[Math.floor(Math.random() * line.length)];
  if (line) setStatus(line);
}

let speechTimer = null;
function setStatus(text) {
  const el = document.getElementById('speech');
  el.textContent = text;
  el.classList.add('show');
  if (speechTimer) clearTimeout(speechTimer);
  speechTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ---- データ保存（data.json 経由）----
function savePet() {
  if (!window.codelvl) return;
  window.codelvl.savePetState({
    affection: params.affection, condition: params.condition,
    hunger: params.hunger,       mood:      params.mood,
    evolutionStage, mutationType, bornPalette,
    lastPetDate, lastCommitDate, lastBadPetDate,
    lastDecayTime: Date.now(), coinPoolStart,
    evolutionLocked, evolutionHardLocked,
    // キャラ固有decayレートをmain.jsに伝える（nullならデフォルト使用）
    decayRates: activeCharData().decayRates,
  });
}

function saveCoins(delta, reason) {
  if (!window.codelvl) return;
  window.codelvl.saveCoins({ coins, delta, reason });
}

// ---- 孵化・進化 ----
// hatchRate: 突然変異率（確率アップ卵なら 0.05、通常 0.03）
// 突然変異は孵化時の一発抽選のみ。進化では再抽選しない。
function hatch(hatchRate = MUTATION_RATE) {
  bornPalette  = HATCH_COLORS[Math.floor(Math.random() * HATCH_COLORS.length)];
  mutationType = Math.random() < hatchRate ? rollMutation() : null;
  updateActiveChar();
  savePet();
}

function evolve() {
  if (evolutionStage >= activeStages().length - 1) { params.affection = 100; return; }
  evolutionStage++;
  params.affection = 0; // バーを越えて得た分は持ち越さず、0から再スタート

  evoActive     = true;
  evoStart      = performance.now() / 1000;
  evoBurstDone  = false;
  say('evolving');
}

// なつき度MAXで次の段階へ進める：
//   卵（bornPalette未設定）→ ベビー誕生
//   ベビー / 各形態        → 進化（evolve内で演出＆なつき度リセット）
// 進めたら true を返す。
function tryAdvanceStage() {
  if (params.affection < 100) return false;
  if (!bornPalette) {
    hatch();                 // 卵 → ベビー誕生
    params.affection = 0;    // 次の段階（進化）に向けてリセット
    startHatchEffect();      // 卵が割れて光に包まれる演出
    say(mutationType ? 'mutate' : 'hatch');
  } else {
    if (evolutionLocked || evolutionHardLocked) return false; // 進化ロック中は進化しない
    evolve();                // ベビー → 進化後
  }
  savePet();
  return true;
}

// ---- UI 更新 ----
function setBar(key, value) {
  const el = document.querySelector(`.param[data-key="${key}"]`);
  if (!el) return;
  el.querySelector('.fill').style.width = `${clamp(value, 0, 100)}%`;
}

function renderParams() {
  setBar('condition', params.condition);
  setBar('affection', params.affection);
  setBar('hunger',    params.hunger);
  setBar('mood',      params.mood);
}

function renderCoins() {
  document.getElementById('coins').textContent = `🪙 ${coins}`;
}

// ---- 時間で貯まるコイン ----
function availableUnits() {
  return Math.floor(Math.min(Date.now() - coinPoolStart, COIN_UNIT_MS * coinPoolUnits) / COIN_UNIT_MS);
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const coinMeter = document.getElementById('coin-meter');
const coinCount = document.getElementById('coin-count');
let   coinSegs  = [];

// プールユニット数に合わせてバーのセグメントを作り直す
function rebuildCoinSegments() {
  coinMeter.innerHTML = '';
  for (let i = 0; i < coinPoolUnits; i++) {
    const seg  = document.createElement('div');
    seg.className = 'cseg';
    const fill = document.createElement('div');
    fill.className = 'cfill';
    seg.appendChild(fill);
    coinMeter.appendChild(seg);
  }
  coinSegs = Array.from(coinMeter.querySelectorAll('.cfill'));
}

function updateCoinDisplay() {
  const totalMax = COIN_UNIT_MS * coinPoolUnits;
  const elapsed  = Math.min(Date.now() - coinPoolStart, totalMax);
  const units    = availableUnits();
  const committed = todayStr() === lastCommitDate;

  for (let i = 0; i < coinSegs.length; i++) {
    coinSegs[i].style.width = `${clamp((elapsed - i * COIN_UNIT_MS) / COIN_UNIT_MS, 0, 1) * 100}%`;
  }
  coinCount.textContent = (totalMax - elapsed) <= 0 ? '満タン' : fmtTime(totalMax - elapsed);
  coinMeter.classList.toggle('ready',  units >= 1 && committed);
  coinMeter.classList.toggle('locked', units >= 1 && !committed);
}

function claimCoins() {
  if (todayStr() !== lastCommitDate) { say('needCommit'); return; }
  const units = availableUnits();
  if (units < 1) { say('notReady'); return; }
  const gained = units * COINS_PER_UNIT;
  coins += gained;
  const elapsed = Math.min(Date.now() - coinPoolStart, COIN_UNIT_MS * coinPoolUnits);
  coinPoolStart = Date.now() - (elapsed - units * COIN_UNIT_MS);
  savePet();
  saveCoins(gained, 'claim');
  renderCoins();
  updateCoinDisplay();
  say('claim', gained);
}

coinMeter.addEventListener('click', claimCoins);
setInterval(updateCoinDisplay, 1000);

// ---- ごはんボタン ----
document.getElementById('feed-btn').addEventListener('click', () => {
  if (evoActive || hatchActive) return;
  if (coins < FOOD_COST) { say('notEnoughCoin'); return; }
  coins -= FOOD_COST;
  params.hunger = clamp(params.hunger + FEED_HUNGER, 0, 100);
  params.mood   = clamp(params.mood   + FEED_MOOD,   0, 100);
  triggerHappy();
  savePet();
  saveCoins(-FOOD_COST, 'feed');
  renderParams();
  renderCoins();
  say('feed');
});

// ---- キャンバスクリック（なでる・触られたくない場所）----
view.addEventListener('click', (e) => {
  if (evoActive || hatchActive) return;

  // クリック位置を論理座標に変換
  const rect = view.getBoundingClientRect();
  const lx = (e.clientX - rect.left) * LOGICAL_W / view.clientWidth;
  const ly = (e.clientY - rect.top)  * LOGICAL_H / view.clientHeight;

  // 触られたくない場所の判定（キャラ固有 or デフォルト）
  const zone = activeCharData().dislikedZone || DISLIKED_ZONE;
  const inBadZone = lx >= zone.x && lx < zone.x + zone.w &&
                    ly >= zone.y  && ly < zone.y  + zone.h;

  if (inBadZone) {
    triggerBad();
    const today = todayStr();
    if (today === lastBadPetDate) {
      say('badTouchDone');
    } else {
      params.mood      = clamp(params.mood      - BAD_TOUCH_PENALTY, 0, 100);
      params.condition = clamp(params.condition - BAD_TOUCH_PENALTY, 0, 100);
      lastBadPetDate = today;
      say('badTouch');
    }
    savePet();
    renderParams();
    return;
  }

  // 通常のなでなで
  triggerHappy();
  params.mood = clamp(params.mood + PET_MOOD, 0, 100);
  const today = todayStr();
  if (today !== lastCommitDate) {
    say('needCommit');
  } else if (today === lastPetDate) {
    say('alreadyPet');
  } else {
    params.affection = clamp(params.affection + PET_GAIN, 0, 100);
    lastPetDate = today;
    if (!tryAdvanceStage()) {
      // ロック中でなつき度MAXなら専用セリフ、それ以外は通常セリフ
      if ((evolutionLocked || evolutionHardLocked) && params.affection >= 100) say('evoLocked');
      else say('petUp');
    }
  }
  savePet();
  renderParams();
});

// ---- IPC：通知・XP・decayTick ----
function updateUI(stats) {
  document.getElementById('level-badge').textContent = `Lv.${stats.level ?? 1}`;
}

if (window.codelvl) {
  window.codelvl.onUpdateStats(updateUI);
  window.codelvl.onXpGained(({ reason, moodDelta, xp, capped, boosted }) => {
    // 卵状態：コミットでなつき度を獲得し、MAXになったら孵化（即孵化はしない）
    if (!bornPalette) {
      params.affection = clamp(params.affection + EGG_AFFECTION_PER_COMMIT, 0, 100);
      tryAdvanceStage(); // MAXならベビー誕生（hatch内でセリフ）
      savePet();
      renderParams();
      updateCoinDisplay();
      return;
    }

    const delta = moodDelta ?? 3;
    params.condition = clamp(params.condition + 10, 0, 100);
    params.mood      = clamp(params.mood + delta, 0, 100);
    lastCommitDate   = todayStr();
    savePet();
    renderParams();
    updateCoinDisplay();

    // キャップに当たったら専用セリフ
    if (capped && xp === 0) {
      say('capReached');
    } else if (delta >= 8)   { triggerHappy(); say('commitBig',    xp, boosted); }
    else if (delta >= 0)     { triggerHappy(); say('commitNormal', xp, boosted); }
    else                     { say('commitSmall', xp, boosted); }
  });
  // mainプロセスからの定期decay通知
  window.codelvl.onDecayTick((pet) => {
    params.condition = pet.condition ?? params.condition;
    params.hunger    = pet.hunger    ?? params.hunger;
    params.mood      = pet.mood      ?? params.mood;
    renderParams();
  });
}

// ---- 非同期初期化：data.json から状態を復元 ----
(async () => {
  if (window.codelvl) {
    const state = await window.codelvl.getGameState();
    const pet   = state.pet || {};
    params.affection  = pet.affection  ?? 60;
    params.condition  = pet.condition  ?? 80;
    params.hunger     = pet.hunger     ?? 70;
    params.mood       = pet.mood       ?? 80;
    evolutionStage    = pet.evolutionStage  ?? 0;
    mutationType      = pet.mutationType    ?? null;
    bornPalette       = pet.bornPalette     ?? null;
    lastPetDate       = pet.lastPetDate     ?? '';
    lastCommitDate    = pet.lastCommitDate  ?? '';
    lastBadPetDate    = pet.lastBadPetDate  ?? '';
    coinPoolStart     = pet.coinPoolStart   ?? Date.now();
    evolutionLocked      = pet.evolutionLocked     ?? false;
    evolutionHardLocked  = pet.evolutionHardLocked ?? false;
    coins             = state.coins ?? 30;
    coinPoolUnits     = state.coinPoolUnits ?? 3;
    updateUI(state);
  }

  // 卵状態のまま待機（孵化は最初のコミット時）
  updateActiveChar(); // bornPaletteがあればキャラを選択

  rebuildCoinSegments(); // プールユニット数ぶんのバーを生成
  renderParams();
  renderCoins();
  updateCoinDisplay();
  renderEvoLock();       // 進化ロックバッジを初期表示
})();

// ===== アイテムボックス =====
// アイテム定義カタログ（id → 表示情報）。将来ガチャ排出もこのidを使う。
const ITEM_CATALOG = {
  egg_normal:  { name: '普通のたまご',   tag: 'egg',        icon: '🥚' },
  egg_rare:    { name: '確率アップ卵',   tag: 'egg',        icon: '🥚' },
  egg_choice:  { name: '選べる卵',       tag: 'egg',        icon: '🥚' },
  deco_ribbon: { name: 'リボン',         tag: 'decoration', icon: '🎀' },
  deco_crown:  { name: 'おうかん',       tag: 'decoration', icon: '👑' },
  deco_glasses:{ name: 'メガネ',         tag: 'decoration', icon: '👓' },
  furn_chair:  { name: 'いす',           tag: 'furniture',  icon: '🪑' },
  furn_lamp:   { name: 'ランプ',         tag: 'furniture',  icon: '💡' },
  furn_plant:  { name: 'かんようしょくぶつ', tag: 'furniture', icon: '🪴' },
  item_food:     { name: 'ごはん券',                   tag: 'item', icon: '🍖' },
  item_boost:    { name: 'XPブースト',                 tag: 'item', icon: '🔥' },
  item_evo_up:    { name: 'しんかのアメ',           tag: 'item', icon: '🍡' },
  item_evo_stop:  { name: 'たいかのアメ',           tag: 'item', icon: '🍬' },
  item_evo_stop2: { name: 'せいちょうしたくないアメ', tag: 'item', icon: '🍭' },

  // ⚠ テスト用：ベースカラー3色のモンスター個体（確認後に消す）
  mon_gecko_green: { name: 'きいろん（休止）', tag: 'monster', icon: '🦎' },
  mon_gecko_blue:  { name: 'ももこ（休止）',   tag: 'monster', icon: '🦎' },
  mon_gecko_gold:  { name: 'くろすけ（休止）', tag: 'monster', icon: '🦎' },
};

const TAG_LABELS = { egg: '卵', monster: 'モンスター', furniture: '家具', decoration: '装飾品', item: 'アイテム' };

let inventory   = [];
let activeTag   = 'all';

const boxModal = document.getElementById('itembox');
const boxGrid  = document.getElementById('itembox-grid');

async function refreshInventory() {
  if (window.codelvl) inventory = await window.codelvl.getInventory();
  renderInventory();
}

function renderInventory() {
  boxGrid.innerHTML = '';
  const items = inventory.filter((it) => {
    const meta = ITEM_CATALOG[it.id];
    if (!meta) return false;
    return activeTag === 'all' || meta.tag === activeTag;
  });

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.id = 'itembox-empty';
    empty.textContent = 'なにも持っていません';
    boxGrid.appendChild(empty);
    return;
  }

  for (const it of items) {
    const meta = ITEM_CATALOG[it.id];
    const slot = document.createElement('div');
    slot.className = 'slot';
    // ロック系アメ：有効中は視覚的に強調
    const isSoftActive = it.id === 'item_evo_stop'  && evolutionLocked;
    const isHardActive = it.id === 'item_evo_stop2' && evolutionHardLocked;
    if (isSoftActive) slot.classList.add('slot-active');
    if (isHardActive) slot.classList.add('slot-hard-active');
    const activeMark = isSoftActive ? ' (有効中🔒)' : isHardActive ? ' (有効中🔐)' : '';
    slot.title = `${meta.name}${activeMark} ×${it.qty}`;
    slot.innerHTML = `<span>${meta.icon}</span><span class="qty">${it.qty}</span>`;
    // モンスターはクリックで部屋に出す
    if (meta.tag === 'monster') {
      slot.addEventListener('click', () => deployMonster(it.id));
    }
    // 消費アイテムはクリックで使用
    if (it.id === 'item_evo_up' || it.id === 'item_evo_stop' || it.id === 'item_evo_stop2') {
      slot.addEventListener('click', () => useItem(it.id));
    }
    boxGrid.appendChild(slot);
  }
}

// モンスターを部屋に出す（テスト用：ベースカラー3色のゲッコー）
function deployMonster(id) {
  const m = id.match(/^mon_gecko_(\w+)$/);
  if (!m) return;
  bornPalette    = m[1];   // green / blue / gold
  mutationType   = null;
  evolutionStage = 0;
  updateActiveChar();
  savePet();
  boxModal.classList.add('hidden'); // ボックスを閉じて部屋を見せる
  triggerHappy();
  say('hatch');
}

// 進化ロックバッジの表示/非表示を切り替える
function renderEvoLock() {
  const badge = document.getElementById('evo-lock-badge');
  if (!badge) return;
  const locked = evolutionLocked || evolutionHardLocked;
  badge.classList.toggle('hidden', !locked);
  // ハードロック中は 🔐、ソフトロック中は 🔒 で区別
  badge.textContent = evolutionHardLocked ? '🔐' : '🔒';
}

// アイテムを使用する（消費系アイテム）
async function useItem(id) {
  if (evoActive || hatchActive) return;
  const entry = inventory.find(it => it.id === id);
  if (!entry || entry.qty < 1) return;

  if (id === 'item_evo_up') {
    // しんかのアメ：即進化。ソフト・ハードどちらのロックも強制解除（卵・最終形態は不可）
    if (!bornPalette) { say('evoNotBorn'); return; }
    if (evolutionStage >= activeStages().length - 1) { say('evoAlreadyMax'); return; }
    await window.codelvl?.removeItem(id, 1);
    evolutionLocked     = false;
    evolutionHardLocked = false;
    evolve();
    say('evoUpUsed');
    savePet();
    renderEvoLock();
    refreshInventory();

  } else if (id === 'item_evo_stop') {
    // たいかのアメ：ソフトロックをトグル（ON↔OFF 各1個消費）
    // ただしハードロック中は解除できない
    if (evolutionHardLocked) { say('evoHardLockBlocked'); return; } // 消費しない
    await window.codelvl?.removeItem(id, 1);
    evolutionLocked = !evolutionLocked;
    say(evolutionLocked ? 'evoStopActivate' : 'evoStopDeactivate');
    savePet();
    renderEvoLock();
    refreshInventory();

  } else if (id === 'item_evo_stop2') {
    // せいちょうしたくないアメ：ハードロックを設定（しんかのアメ以外では解除不可）
    if (evolutionHardLocked) { say('evoHardLockAlready'); return; } // 消費しない
    await window.codelvl?.removeItem(id, 1);
    evolutionLocked     = false; // ソフトロックは上書きしてハードロックに統合
    evolutionHardLocked = true;
    say('evoHardLockOn');
    savePet();
    renderEvoLock();
    refreshInventory();
  }
}

// ボタン・タブ・閉じる
document.getElementById('box-btn').addEventListener('click', () => {
  boxModal.classList.remove('hidden');
  refreshInventory();
});
document.getElementById('box-close').addEventListener('click', () => {
  boxModal.classList.add('hidden');
});

// 進化形態リセット：卵の状態に戻して 卵→ベビー→進化 を最初から確認する
document.getElementById('reset-evo-btn').addEventListener('click', () => {
  bornPalette = null;
  mutationType = null;
  evolutionStage = 0;
  evoActive = false;            // 進化演出が走っていたら止める
  hatchActive = false;          // 孵化演出も止める
  params.affection = 0;         // なつきも戻して再度の進化テストをしやすく
  updateActiveChar();
  savePet();
  renderParams();
  updateCoinDisplay();
  setStatus('卵にもどしました（コミットで孵化します）');
});
document.querySelectorAll('#itembox-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#itembox-tabs .tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeTag = tab.dataset.tag;
    renderInventory();
  });
});

// ---- ⚠ テスト用ショートカット（確認後は消す）----
window.addEventListener('keydown', (e) => {
  if (e.key === 'a' || e.key === 'A') {
    params.affection = clamp(params.affection + 20, 0, 100); triggerHappy();
    tryAdvanceStage(); // MAXなら 卵→ベビー / ベビー→進化
    renderParams(); savePet();
  } else if (e.key === 'c' || e.key === 'C') {
    lastCommitDate = todayStr();
    params.condition = clamp(params.condition + 10, 0, 100);
    if (!bornPalette) {
      params.affection = clamp(params.affection + EGG_AFFECTION_PER_COMMIT, 0, 100);
      tryAdvanceStage(); // コミット約3回でなつき度MAX→孵化
    }
    savePet(); renderParams(); updateCoinDisplay(); setStatus('（テスト）コミット済み');
  } else if (e.key === 't' || e.key === 'T') {
    coinPoolStart -= COIN_UNIT_MS; savePet(); updateCoinDisplay(); setStatus('（テスト）10分すすめた');
  } else if (e.key === 'm' || e.key === 'M') {
    // （テスト）強制突然変異（プラチナ/発光/宝石をランダム）
    mutationType = rollMutation();
    savePet(); say('mutate');
  } else if (e.key === 'h' || e.key === 'H') {
    // 卵状態にリセット（孵化テスト用）
    bornPalette = null; mutationType = null; evolutionStage = 0;
    savePet(); setStatus('（テスト）卵にもどした');
  } else if (e.key === 'y' || e.key === 'Y') {
    // （テスト）あくびモーションを即発火（全ステージ対応）
    const set = yawnSetFor(evolutionStage, currentPaletteName());
    if (set && set.frames.length && bornPalette) {
      yawn.active = true; yawn.start = performance.now() / 1000;
      setStatus('（テスト）あくび');
    } else {
      setStatus('（テスト）あくび素材なし');
    }
  } else if (e.key === 'b' || e.key === 'B') {
    // 触られたくない場所のテスト（強制ペナルティ発動）
    lastBadPetDate = ''; setStatus('（テスト）bad-touch リセット');
  } else if (e.key === 'v' || e.key === 'V') {
    // （テスト）ベースカラー3色を順に切り替え（green→blue→gold）
    const order = ['green', 'blue', 'gold'];
    const cur   = currentPaletteName();
    bornPalette = order[(order.indexOf(cur) + 1) % order.length];
    mutationType = null;
    updateActiveChar();
    savePet();
    setStatus(`（テスト）カラー: ${bornPalette}`);
  } else if (e.key === 'i' || e.key === 'I') {
    // （テスト）ランダムなアイテムをボックスに付与
    const ids = Object.keys(ITEM_CATALOG);
    const id  = ids[Math.floor(Math.random() * ids.length)];
    window.codelvl?.addItem(id, 1).then(() => {
      refreshInventory();
      setStatus(`（テスト）${ITEM_CATALOG[id].name} を入手`);
    });
  } else if (e.key === 'x' || e.key === 'X') {
    // （テスト）XPブースト発動（1.5h）
    window.codelvl?.activateXpBoost().then(() => setStatus('（テスト）XPブースト1.5h🔥'));
  } else if (e.key === 'p' || e.key === 'P') {
    // （テスト）コインプール拡張（+10分/+10コイン、最大5ユニット）
    window.codelvl?.expandCoinPool().then((u) => {
      coinPoolUnits = u;
      rebuildCoinSegments();
      updateCoinDisplay();
      setStatus(`（テスト）プール拡張 → ${u}ユニット(${u * 10}分/${u * 10}🪙)`);
    });
  }
});
