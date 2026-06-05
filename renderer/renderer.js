// ===== CodeLv: たまごっき風プロトタイプ =====
// 部屋とキャラをドット絵としてコードで直接描画する。
// 論理解像度 80x64 → 4倍拡大で 320x256 のcanvasに表示。

const LOGICAL_W = 80;
const LOGICAL_H = 64;
const SCALE     = 4;

const view = document.getElementById('scene');
const vctx = view.getContext('2d');
vctx.imageSmoothingEnabled = false;

// ---- 画像読み込み＋背景自動透過（共通関数）----
// src を読み込み、フラッドフィルで背景を透過にしてcanvasを返すPromise
function loadImageWithBgRemoval(src, { tol = 38, removeShadow = true, removeGold = false } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, w, h);
      const d  = id.data;

      // フラッドフィル共通関数
      function floodFill(seedX, seedY, refR, refG, refB, tolerance) {
        const vis = new Uint8Array(w * h);
        const stk = [];
        function push(x, y) {
          if (x >= 0 && x < w && y >= 0 && y < h && !vis[y * w + x]) stk.push(x, y);
        }
        push(seedX, seedY);
        while (stk.length) {
          const fy = stk.pop(), fx = stk.pop();
          if (vis[fy * w + fx]) continue;
          vis[fy * w + fx] = 1;
          const fi = (fy * w + fx) * 4;
          if (d[fi + 3] === 0) continue;
          const dr = d[fi] - refR, dg = d[fi+1] - refG, db = d[fi+2] - refB;
          if (dr*dr + dg*dg + db*db < tolerance*tolerance) {
            d[fi + 3] = 0;
            push(fx-1,fy); push(fx+1,fy); push(fx,fy-1); push(fx,fy+1);
          }
        }
      }

      // 1. 四辺から背景除去
      const bgR = d[0], bgG = d[1], bgB = d[2];
      for (let x = 0; x < w; x++) {
        floodFill(x, 0,   bgR, bgG, bgB, tol);
        floodFill(x, h-1, bgR, bgG, bgB, tol);
      }
      for (let y = 0; y < h; y++) {
        floodFill(0,   y, bgR, bgG, bgB, tol);
        floodFill(w-1, y, bgR, bgG, bgB, tol);
      }

      // 2. 金色キラキラ除去（卵専用オプション）
      if (removeGold) {
        for (let i = 0; i < d.length; i += 4) {
          if (d[i+3] === 0) continue;
          const r = d[i], g = d[i+1], b = d[i+2];
          const maxC = Math.max(r,g,b), minC = Math.min(r,g,b);
          const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
          if (r === maxC && sat > 0.28 && maxC > 120) d[i+3] = 0;
        }
      }

      // 3. 影ディスク除去（底部中央から2回目フラッドフィル）
      if (removeShadow) {
        for (let sy = h-1; sy >= Math.floor(h * 0.78); sy--) {
          const si = (sy * w + Math.floor(w/2)) * 4;
          if (d[si+3] > 0) {
            floodFill(Math.floor(w/2), sy, d[si], d[si+1], d[si+2], 55);
            break;
          }
        }
      }

      ctx.putImageData(id, 0, 0);
      resolve(tmp);
    };
    img.src = src;
  });
}

// ---- 卵・キャラ画像の読み込み ----
let eggCanvas = null;
loadImageWithBgRemoval('./assets/たまご.png', { tol: 38, removeGold: true, removeShadow: true })
  .then(c => { eggCanvas = c; });

// スプライト画像マップ: spriteImages['gecko']['green'][0] = canvas
const spriteImages = { gecko: { green: [], blue: [], gold: [] } };
loadImageWithBgRemoval('./assets/ニシアフリカトカゲモドキ1.png').then(c => { spriteImages.gecko.green[0] = c; });
loadImageWithBgRemoval('./assets/ニシアフリカトカゲモドキ2.png').then(c => { spriteImages.gecko.blue[0]  = c; });
loadImageWithBgRemoval('./assets/ニシアフリカトカゲモドキ3.png').then(c => { spriteImages.gecko.gold[0]  = c; });

// オフスクリーン（論理解像度）に描いてから拡大する
const off = document.createElement('canvas');
off.width  = LOGICAL_W;
off.height = LOGICAL_H;
const g = off.getContext('2d');

const FLOOR_Y = 44; // 床の境界ライン（論理px）

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

// ---- キャラ（スライム系の生き物）----
function drawCreature(cx, feetY, sx, sy, blink, smile, tint, stageOverride) {
  const stages = activeStages();
  const pal    = activePalette();
  const stIdx  = stageOverride != null ? stageOverride : evolutionStage;
  const st     = stages[Math.min(Math.max(stIdx, 0), stages.length - 1)];
  const rxBase = 13 * st.scale, ryBase = 11 * st.scale;
  const rx = rxBase * sx, ry = ryBase * sy;
  const cy = feetY - ry;

  const { body, hi, sh } = pal;

  if (!tint) {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = -rx; x <= rx; x++) {
      const w = Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
      if (w > 0) g.fillRect((cx + x) | 0, (feetY + 1) | 0, 1, Math.max(1, (w * 2) | 0));
    }
  }

  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        let c = tint ? tint : (ny < -0.4 && Math.abs(nx) < 0.55 ? hi : ny > 0.5 ? sh : body);
        g.fillStyle = c;
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  if (tint) return;

  const eyeY = cy - ry * 0.05;
  const eyeDX = rx * 0.42;
  for (const dir of [-1, 1]) {
    const ex = cx + dir * eyeDX;
    if (blink) {
      px(ex - 1, eyeY, 3, 1, '#1c2a22');
    } else {
      px(ex - 1, eyeY - 1, 2, 3, '#1c2a22');
      px(ex - 1, eyeY - 1, 1, 1, '#ffffff');
    }
  }

  px(cx - eyeDX - 2, eyeY + 2, 2, 1, 'rgba(255,140,160,0.55)');
  px(cx + eyeDX + 1, eyeY + 2, 2, 1, 'rgba(255,140,160,0.55)');

  const my = eyeY + 4;
  if (smile) {
    px(cx - 2, my, 1, 1, '#1c2a22');
    px(cx - 1, my + 1, 3, 1, '#1c2a22');
    px(cx + 2, my, 1, 1, '#1c2a22');
  } else {
    px(cx, my, 1, 1, '#1c2a22');
  }
}

// ---- アニメーション状態 ----
let lastBlink = 0, nextBlinkGap = 2.5, blinking = false, blinkEnd = 0;
let happyEnd = 0;
let badEnd   = 0;
const hearts   = [];
const sparkles = [];

// ---- スプライト用アイドルアニメーション ----
const idleAnim = { nextTick: 0, tickEnd: 0, tickType: 0 };

function getSpriteOffsets(now) {
  // 呼吸：ゆっくり上下（約7秒周期）
  const breathY = Math.sin(now * 0.85) * 2.5;

  // 常時ごくわずかに揺れ（体重移動感）
  const microRot = Math.sin(now * 0.3) * 0.008;

  // 時々発生するアクション（3〜8秒ごと）
  let extraY = 0, actionRot = 0;
  if (now > idleAnim.nextTick) {
    idleAnim.nextTick = now + 3 + Math.random() * 5;
    idleAnim.tickEnd  = now + 0.45;
    idleAnim.tickType = Math.random() < 0.5 ? 1 : 2;
  }
  if (now < idleAnim.tickEnd) {
    const p = (idleAnim.tickEnd - now) / 0.45; // 1→0
    if (idleAnim.tickType === 1) {
      extraY     = -Math.sin(p * Math.PI) * 5;  // 小ジャンプ
    } else {
      actionRot  =  Math.sin(p * Math.PI) * 0.07; // かしぎ
    }
  }

  return { dy: breathY + extraY, rot: microRot + actionRot };
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

  if (p < 0.18) {
    const shake = Math.sin(now * 48) * (p / 0.18) * 1.4;
    drawCreature(cx + shake, feetY, 1, 1, false, false, null, evolutionStage - 1);
  } else if (p < 0.8) {
    const fp = (p - 0.18) / 0.62;
    const freq = 6 + fp * 34;
    const pulse = 0.55 + 0.45 * Math.sin(now * freq);
    const sc = 1 + 0.05 * Math.sin(now * freq);
    drawCreature(cx, feetY, sc, sc, false, false, `rgba(255,255,255,${pulse})`);
  } else if (p < 0.9) {
    if (!evoBurstDone) { spawnSparkles(); evoBurstDone = true; }
    const fa = 1 - Math.abs((p - 0.85) / 0.05);
    g.fillStyle = `rgba(255,255,255,${clamp(fa, 0, 1)})`;
    g.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  } else {
    drawCreature(cx, feetY, 1, 1, false, true);
    if (hearts.length < 2) {
      hearts.push({ x: cx + (Math.random() * 16 - 8), y: 28, vy: 8, vx: Math.random() * 3 - 1.5, life: 1.4 });
    }
  }
}

// 宝石を描く（cx,cy中心、rサイズ、colorカラー）
function drawGem(ctx, cx, cy, r, color, now) {
  ctx.save();
  ctx.translate(cx, cy);
  // 後光
  ctx.shadowColor = color;
  ctx.shadowBlur  = 10;
  // ダイヤ型
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.8, -r * 0.2);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.8, -r * 0.2);
  ctx.closePath();
  ctx.fill();
  // ハイライト（きらめき）
  ctx.shadowBlur = 0;
  const tw = 0.5 + 0.5 * Math.sin(now * 5);
  ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * tw})`;
  ctx.beginPath();
  ctx.moveTo(-r * 0.25, -r * 0.45);
  ctx.lineTo(0, -r * 0.1);
  ctx.lineTo(-r * 0.4, -r * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
  } else {
    const happy = now < happyEnd;
    let sx = 1 + 0.03 * Math.sin(now * 2.2);
    let sy = 1 - 0.03 * Math.sin(now * 2.2);
    let feetY = FLOOR_Y + 7;
    let cx    = 40;

    if (happy) {
      const p = 1 - (happyEnd - now) / 1.2;
      feetY -= Math.abs(Math.sin(p * Math.PI * 2)) * 8;
      const stretch = 0.1 * Math.sin(p * Math.PI * 2);
      sx = 1 - stretch; sy = 1 + stretch;
    }

    // ぶるぶる（触られたくない場所）
    if (now < badEnd) {
      const p = (badEnd - now) / 0.6;
      cx += Math.sin(now * 42) * p * 2.5;
    }

    // スプライト画像がなければコード描画（ある場合はブリット後に描く）
    const pal      = currentPaletteName();
    const stageImg = spriteImages[activeCharData().sprite]?.[pal]?.[evolutionStage];
    if (!stageImg) {
      drawCreature(cx, feetY, sx, sy, blinking, happy);
    }
    // stageImg がある場合の描画パラメータを保存（ブリット後に使う）
    frame._sprite = stageImg ? { stageImg, sx, sy } : null;
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

  // スプライト画像キャラ描画（ブリット後なので消えない）
  if (frame._sprite) {
    const { stageImg } = frame._sprite;
    const st    = activeStages()[Math.min(evolutionStage, activeStages().length - 1)];
    const base  = 120 * st.scale;
    const pivX  = view.width / 2;
    const pivY  = (FLOOR_Y + 8) * SCALE;
    const off   = getSpriteOffsets(now);

    // 影（かしぎに合わせて少しズレる）
    const shadowX = pivX + Math.sin(off.rot) * base * 0.25;
    vctx.save();
    vctx.globalAlpha = 0.2;
    vctx.fillStyle = '#1a1025';
    vctx.beginPath();
    vctx.ellipse(shadowX, pivY + 3, base * 0.42, 5, 0, 0, Math.PI * 2);
    vctx.fill();
    vctx.restore();

    // キャラ本体（足元を軸に呼吸・かしぎ・ジャンプ）＋突然変異エフェクト
    const ms = mutationStyle();
    vctx.save();
    vctx.imageSmoothingEnabled = true;
    vctx.imageSmoothingQuality = 'high';
    vctx.translate(pivX, pivY + off.dy);
    vctx.rotate(off.rot);

    // 発光：脈動するグロー（影として後光）
    if (mutationType === 'glow' && ms) {
      vctx.shadowColor = ms.color;
      vctx.shadowBlur  = 16 + Math.sin(now * 4) * 8;
    }
    // プラチナ：金属フィルタで質感変更
    if (mutationType === 'platinum' && ms) {
      vctx.filter = ms.filter;
    }
    vctx.drawImage(stageImg, -base / 2, -base, base, base);
    vctx.filter = 'none';
    vctx.shadowBlur = 0;

    // 宝石：頭上に宝石をひとつ乗せる（位置はデザイン確定後に調整）
    if (mutationType === 'jewel' && ms) {
      drawGem(vctx, 0, -base * 0.92, base * 0.11, ms.color, now);
    }
    vctx.restore();
  }

  // 卵状態（初コミット前）: 背景透過済みeggCanvasを描画
  if (!bornPalette && eggCanvas) {
    const eW = 108, eH = 116;
    const pivotX = view.width / 2;           // 回転の軸X（底面中央）
    const pivotY = (FLOOR_Y + 8) * SCALE;    // 回転の軸Y（床面）
    const wobble = Math.sin(now * 1.6) * 0.04;

    // 影：傾きに合わせてX方向にズレる（傾いた分だけ重心が移動する感じ）
    const shadowShift = Math.sin(wobble) * eH * 0.28;
    vctx.save();
    vctx.globalAlpha = 0.22;
    vctx.fillStyle = '#1a1025';
    vctx.beginPath();
    vctx.ellipse(pivotX + shadowShift, pivotY + 4, eW * 0.32, 5, 0, 0, Math.PI * 2);
    vctx.fill();
    vctx.restore();

    // 卵本体：底面を軸に左右に揺れる
    vctx.save();
    vctx.imageSmoothingEnabled = true;
    vctx.imageSmoothingQuality = 'high';
    vctx.translate(pivotX, pivotY);
    vctx.rotate(wobble);
    vctx.drawImage(eggCanvas, -eW / 2, -eH, eW, eH);
    vctx.restore();

    // キラキラ：画像のきらめき位置に合わせて上下点滅
    // dx/dy は pivotX/Y からのオフセット（画像内のキラキラ位置に対応）
    const sparkDefs = [
      { dx: -eW * 0.60, dy: -eH * 0.84, size: 9,  phase: 0.0  },
      { dx:  eW * 0.50, dy: -eH * 0.68, size: 6,  phase: 1.4  },
      { dx: -eW * 0.68, dy: -eH * 0.24, size: 6,  phase: 2.8  },
    ];

    for (const sp of sparkDefs) {
      const pulse  = 0.5 + 0.5 * Math.sin(now * 3.5 + sp.phase);  // 0→1→0
      const bobY   = Math.sin(now * 2.2 + sp.phase) * 3;           // 上下に揺れる
      const sz     = sp.size * (0.6 + 0.4 * pulse);
      const alpha  = 0.3 + 0.7 * pulse;

      const sx = pivotX + sp.dx;
      const sy = pivotY + sp.dy + bobY;

      vctx.save();
      vctx.globalAlpha = alpha;
      vctx.fillStyle = '#ffd24a';
      vctx.shadowColor = '#ffe27a';
      vctx.shadowBlur = sz * 1.5;
      // 4点の星を描く
      vctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 - Math.PI / 2;
        const r = i % 2 === 0 ? sz : sz * 0.28;
        const px = sx + Math.cos(angle) * r;
        const py = sy + Math.sin(angle) * r;
        i === 0 ? vctx.moveTo(px, py) : vctx.lineTo(px, py);
      }
      vctx.closePath();
      vctx.fill();
      vctx.restore();
    }
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// ---- ゲームパラメータ ----
const params = { condition: 80, affection: 60, hunger: 70, mood: 80 };

const PET_GAIN    = 20 / 3;
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
function activePalette() {
  const base = getPalette(currentPaletteName());
  // プラチナ変異はコード描画キャラの色も差し替え（画像キャラはフィルタで表現）
  if (mutationType === 'platinum') {
    const c = mutationStyle().color;
    return { body: c, hi: '#ffffff', sh: c };
  }
  return base;
}

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
    params.affection += PET_GAIN;
    lastPetDate = today;
    if (params.affection >= 100) evolve();
    else say('petUp');
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
    // 卵状態なら孵化させてから処理
    if (!bornPalette) {
      hatch();
      triggerHappy();
      say(mutationType ? 'mutate' : 'hatch'); // 変異して生まれたら専用セリフ
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
    params.affection += 20; triggerHappy();
    if (params.affection >= 100) evolve(); else renderParams();
    savePet();
  } else if (e.key === 'c' || e.key === 'C') {
    lastCommitDate = todayStr();
    params.condition = clamp(params.condition + 10, 0, 100);
    if (!bornPalette) {
      hatch(); triggerHappy(); say(mutationType ? 'mutate' : 'hatch');
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
