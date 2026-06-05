// ===== CodeLv: たまごっき風プロトタイプ =====
// 部屋とキャラをドット絵としてコードで直接描画する。
// 論理解像度 80x64 → 4倍拡大で 320x256 のcanvasに表示。

const LOGICAL_W = 80;
const LOGICAL_H = 64;
const SCALE     = 4;

const view = document.getElementById('scene');
const vctx = view.getContext('2d');
vctx.imageSmoothingEnabled = false;

// ===== ゲッコー スプライト（画像ダウンサンプル方式）=====
const GECKO_DOT_W = 110;
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
const dotFrames = { gecko: { idle: { green: [], blue: [], gold: [] } } };

function loadDotSprite(src, target, index = 0, dotW = GECKO_DOT_W, bgTol = 50) {
  const img = new Image();
  img.onload = () => {
    const crop = { x0: 0, y0: 0, x1: img.naturalWidth, y1: img.naturalHeight };
    target[index] = makeDotSprite(img, crop, dotW, { bgTol });
  };
  img.src = src;
}

// idle[pal] は進化段階で索引: [0]=ベビー, [1]=進化後
// stage 0（ベビー）: 1→green, 2→blue, 3→gold（イラストsprite と同じ対応）
loadDotSprite('./assets/ニシアフリカトカゲモドキ1.png',     dotFrames.gecko.idle.green);
loadDotSprite('./assets/ニシアフリカトカゲモドキ2.png',     dotFrames.gecko.idle.blue);
loadDotSprite('./assets/ニシアフリカトカゲモドキ3.png',     dotFrames.gecko.idle.gold);
// stage 1（進化後）: 進化１→green, 進化２→blue, 進化３→gold（番号＝個体が一致）
loadDotSprite('./assets/ニシアフリカトカゲモドキ進化１.png', dotFrames.gecko.idle.green, 1);
loadDotSprite('./assets/ニシアフリカトカゲモドキ進化２.png', dotFrames.gecko.idle.blue,  1);
loadDotSprite('./assets/ニシアフリカトカゲモドキ進化３.png', dotFrames.gecko.idle.gold,  1);
// 卵（孵化前）: ドット絵。eggDot[0]
const eggDot = [];
loadDotSprite('./assets/たまご１.png', eggDot);

const EGG_DRAW_W = 76; // 卵の描画幅(px)。小さめに。大きさはここで調整

// オフスクリーン（論理解像度）に描いてから拡大する
const off = document.createElement('canvas');
off.width  = LOGICAL_W;
off.height = LOGICAL_H;
const g = off.getContext('2d');

const FLOOR_Y = 44; // 床の境界ライン（論理px）

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ===== エモート（あくび等）は廃止 =====
// モーションは後日スプライト生成方式で付ける予定。

// ---- 小物描画ヘルパ ----
function px(x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x | 0, y | 0, w, h);
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

// ---- 部屋 ----
function drawRoom() {
  px(0, 0, LOGICAL_W, FLOOR_Y, '#3a3556');
  px(0, FLOOR_Y - 2, LOGICAL_W, 2, '#322d4a');
  px(0, FLOOR_Y, LOGICAL_W, LOGICAL_H - FLOOR_Y, '#6b4f3a');
  for (let x = 0; x < LOGICAL_W; x += 8) px(x, FLOOR_Y, 1, LOGICAL_H - FLOOR_Y, '#5e4533');
  px(0, FLOOR_Y, LOGICAL_W, 1, '#7d5e44');

  const wx = 10, wy = 7, ww = 22, wh = 18;
  px(wx - 1, wy - 1, ww + 2, wh + 2, '#2a2640');
  px(wx, wy, ww, wh, '#7ec8e3');
  px(wx, wy + wh / 2, ww, wh / 2, '#9ad6ec');
  px(wx + ww / 2 - 0.5, wy, 1, wh, '#2a2640');
  px(wx, wy + wh / 2 - 0.5, ww, 1, '#2a2640');
  px(wx + 4, wy + 4, 4, 1, '#ffffff');
  px(wx + 3, wy + 5, 6, 1, '#ffffff');

  px(48, 9, 14, 11, '#caa45a');
  px(50, 11, 10, 7, '#3aa0c0');
  px(52, 14, 3, 3, '#ffe08a');

  const rx = 24, rw = 32;
  px(rx, FLOOR_Y + 6, rw, 8, '#b5563f');
  px(rx + 3, FLOOR_Y + 8, rw - 6, 4, '#d97a5e');

  px(64, FLOOR_Y + 4, 7, 6, '#9c6b44');
  px(65, FLOOR_Y + 3, 5, 1, '#b07c50');
  px(66, FLOOR_Y - 2, 3, 6, '#3f8f55');
  px(64, FLOOR_Y - 4, 3, 3, '#4fae68');
  px(68, FLOOR_Y - 5, 3, 3, '#4fae68');
  px(66, FLOOR_Y - 7, 3, 3, '#5fc878');
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
      { scale: 0.85 }, // ベビー（画像あり）
      { scale: 1.0  }, // 第2形態（画像TBD）
      { scale: 1.2  }, // 第3形態（画像TBD）
      { scale: 1.42 }, // 最終形態（画像TBD）
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

// ---- メインループ ----
let prev = performance.now() / 1000;

function frame() {
  const now = performance.now() / 1000;
  const dt  = now - prev;
  prev = now;

  if (!blinking && now - lastBlink > nextBlinkGap) { blinking = true; blinkEnd = now + 0.12; }
  if (blinking && now > blinkEnd) { blinking = false; lastBlink = now; nextBlinkGap = 2 + Math.random() * 3; }

  drawRoom();

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

  // 部屋を拡大してviewへ（ここでvctxがクリアされる）
  vctx.imageSmoothingEnabled = false;
  vctx.clearRect(0, 0, view.width, view.height);
  vctx.drawImage(off, 0, 0, LOGICAL_W, LOGICAL_H, 0, 0, view.width, view.height);

  // キャラ／卵の描画（ドット絵）。進化演出中はキャラを出さず演出に任せる。
  if (!evoActive) {
    const pal = currentPaletteName(); // green / blue / gold
    // 現在のキャラの画像（進化段階別）を表示。モーションは後日スプライト生成方式で対応予定。
    const frames = dotFrames.gecko.idle[pal];
    // 進化段階で画像を切替（[0]=ベビー, [1]=進化後）。未制作の段階は直近の画像にフォールバック。
    let idx = 0;
    if (frames) {
      idx = Math.min(evolutionStage, frames.length - 1);
      while (idx > 0 && !frames[idx]) idx--;
    }
    // 孵化前（bornPalette未設定）は卵を表示。孵化後はキャラ（進化段階別）を表示。
    const isEgg  = !bornPalette;
    const dotImg = isEgg
      ? eggDot[0]
      : ((frames && frames[idx]) || dotFrames.gecko.idle.gold[0]);
    if (dotImg) {
      // 描画サイズ（アスペクト比は維持）。キャラ: 120 * st.scale ／ 卵: EGG_DRAW_W（小さめ）。
      const st    = activeStages()[Math.min(evolutionStage, activeStages().length - 1)];
      const baseW = isEgg ? EGG_DRAW_W : 120 * st.scale;
      const scale = baseW / dotImg.width;
      const dW   = dotImg.width  * scale;
      const dH   = dotImg.height * scale;
      const pivX = view.width / 2;
      const pivY = (FLOOR_Y + 8) * SCALE;
      const offs = getSpriteOffsets(now);
      vctx.save();
      vctx.globalAlpha = 0.2;
      vctx.fillStyle = '#1a1025';
      vctx.beginPath();
      vctx.ellipse(pivX, pivY + 3, dW * 0.4, 5, 0, 0, Math.PI * 2);
      vctx.fill();
      vctx.restore();
      vctx.save();
      // キャラ/卵は縮小＋微回転するため、最近傍だと走査線状のちらつき
      // （昔のビデオのような縦横線）が出る。高品質補間で滑らかにする。
      vctx.imageSmoothingEnabled = true;
      vctx.imageSmoothingQuality = 'high';
      vctx.translate(pivX, pivY + offs.dy);
      vctx.rotate(offs.rot * 0.5);
      vctx.drawImage(dotImg, -dW / 2, -dH, dW, dH);
      vctx.restore();
    }
  }

  requestAnimationFrame(frame);
}

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
let bornPalette     = null;
let coins           = 30;
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
    badTouch:      ['そこは だめ！', 'やめてよ〜！', 'ぷんぷん！'],
    badTouchDone:  ['きょうは もう やだ'],
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
  params.affection = Math.max(0, params.affection - 100);

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
    triggerHappy();
    say(mutationType ? 'mutate' : 'hatch');
  } else {
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
  if (evoActive) return;
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
  if (evoActive) return;

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
    if (!tryAdvanceStage()) say('petUp'); // MAXなら 卵→ベビー / ベビー→進化
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
  item_food:   { name: 'ごはん券',       tag: 'item',       icon: '🍖' },
  item_boost:  { name: 'XPブースト',     tag: 'item',       icon: '🔥' },

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
    slot.title = `${meta.name} ×${it.qty}`;
    slot.innerHTML = `<span>${meta.icon}</span><span class="qty">${it.qty}</span>`;
    // モンスターはクリックで部屋に出す
    if (meta.tag === 'monster') {
      slot.addEventListener('click', () => deployMonster(it.id));
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
