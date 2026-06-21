// ============================================================
// motions.js  ―― モーション定義（このファイルが「動きの中身」）
// ------------------------------------------------------------
// 新しい動きを足したいときは、下の list に 1 個オブジェクトを
// 追加するだけでUIにも自動で出ます（app.js が list を読みます）。
//
// 各モーションの形：
//   id        … 内部用の名前（重複しない英字）
//   name      … 画面に出る日本語名
//   needsRegion … 範囲指定が要るか（true なら「しっぽ/翼/目」を囲む）
//   regionLabel … 範囲の呼び名（ヒント表示に使う）
//   defaults  … プリセット初期値 { frames, strength, fps }
//   apply(dctx, fc, t, s) … 1フレームを描く関数
//       dctx … 描き込み先の 2D コンテキスト（透明な1コマ）
//       fc   … フレーム文脈（元画像や切り抜き済み素材。frames.js が用意）
//       t    … ループ内の位置 0.0〜1.0（0で先頭、1周で元に戻る）
//       s    … 動きの強さ 0.0〜1.0（スライダー値/100）
// ============================================================

window.SM = window.SM || {};
SM.motions = (function () {
  const TAU = Math.PI * 2;

  // 滑らかに往復する波（-1〜+1）。t=0 と t=1 が同じ値なのでループが繋がる。
  function wave(t) { return Math.sin(t * TAU); }

  // --- 共通ヘルパ：画像全体を「拡縮＋平行移動」して描く ---
  // ax,ay = 拡縮の基準点（足元を固定したいなら下端を渡す）
  function drawWhole(dctx, fc, { sx = 1, sy = 1, dx = 0, dy = 0, ax, ay }) {
    const anchorX = (ax == null) ? fc.frameW / 2 : ax;
    const anchorY = (ay == null) ? fc.frameH - fc.pad : ay; // 既定は足元
    dctx.save();
    dctx.translate(anchorX + dx, anchorY + dy);
    dctx.scale(sx, sy);
    dctx.translate(-anchorX, -anchorY);
    dctx.drawImage(fc.src, 0, 0);
    dctx.restore();
  }

  // --- 共通ヘルパ：範囲だけを支点まわりに回転（＋任意の縦縮み）して描く ---
  function drawRegionRotate(dctx, fc, angle, scaleY = 1) {
    dctx.drawImage(fc.baseHole, 0, 0); // 範囲を抜いた土台（動かない部分）
    if (!fc.patch) return;             // 範囲未指定ならそのまま
    const p = fc.pivot;
    dctx.save();
    dctx.translate(p.x, p.y);
    dctx.rotate(angle);
    dctx.scale(1, scaleY);
    dctx.translate(-p.x, -p.y);
    dctx.drawImage(fc.patch, fc.region.x, fc.region.y);
    dctx.restore();
  }

  // まばたき用：ループの最初のほうで「パチッ」と1回だけ閉じる量（0〜1）。
  function blinkPulse(t) {
    const WIDTH = 0.18;            // この区間だけ閉じる（残りは開いたまま）
    if (t > WIDTH) return 0;
    const x = t / WIDTH;           // 0〜1
    return 1 - Math.abs(x * 2 - 1); // 0→1→0 の三角（閉じて開く）
  }

  const list = [
    // ----- 範囲のいらない「全体」モーション -----
    {
      id: 'breath', name: '呼吸（ふくらむ）', needsRegion: false,
      defaults: { frames: 8, strength: 35, fps: 12 },
      apply(dctx, fc, t, s) {
        const a = s * 0.07;              // 最大ふくらみ率
        const w = wave(t);
        // 足元を固定して、縦に伸び縮み（横は逆位相で体積感を保つ）
        drawWhole(dctx, fc, { sy: 1 + w * a, sx: 1 - w * a * 0.5 });
      }
    },
    {
      id: 'float', name: 'ふわふわ（浮く）', needsRegion: false,
      defaults: { frames: 8, strength: 35, fps: 10 },
      apply(dctx, fc, t, s) {
        const amp = s * fc.srcH * 0.05;  // 上下の振れ幅（px）
        drawWhole(dctx, fc, { dy: wave(t) * -amp }); // 上に浮いて下に戻る
      }
    },
    {
      id: 'jelly', name: 'ぷるぷる（スライム）', needsRegion: false,
      defaults: { frames: 8, strength: 50, fps: 14 },
      apply(dctx, fc, t, s) {
        const a = s * 0.12;
        const w = wave(t);
        // 横に伸びると縦が縮む（足元固定）＝ゼリーの揺れ
        drawWhole(dctx, fc, { sx: 1 + w * a, sy: 1 - w * a });
      }
    },

    // ----- 範囲のいる「部分」モーション -----
    {
      id: 'tail', name: 'しっぽ揺れ', needsRegion: true, regionLabel: 'しっぽ',
      defaults: { frames: 8, strength: 40, fps: 12 },
      apply(dctx, fc, t, s) {
        const deg = s * 14;                       // 最大の振れ角
        const ang = wave(t) * deg * Math.PI / 180;
        drawRegionRotate(dctx, fc, ang);
      }
    },
    {
      id: 'wing', name: '翼パタ', needsRegion: true, regionLabel: '翼',
      defaults: { frames: 8, strength: 45, fps: 12 },
      apply(dctx, fc, t, s) {
        const w = wave(t);
        const ang = w * (s * 12) * Math.PI / 180;
        const fold = 1 - Math.abs(w) * s * 0.12;  // はばたきの折りたたみ感（軽く）
        drawRegionRotate(dctx, fc, ang, fold);
      }
    },
    {
      id: 'blink', name: 'まばたき', needsRegion: true, regionLabel: '目',
      defaults: { frames: 8, strength: 60, fps: 14 },
      apply(dctx, fc, t, s) {
        dctx.drawImage(fc.src, 0, 0);   // まず開いた状態で全体を描く
        if (!fc.region) return;
        const close = blinkPulse(t);    // 0〜1
        if (close <= 0) return;
        const r = fc.region;
        const lid = (r.h * 0.5) * close;         // 上まぶたが下りる量（中央まで）
        const lo  = (r.h * 0.35) * close;        // 下まぶたが持ち上がる量
        dctx.save();
        dctx.fillStyle = fc.skin;                // 肌色のまぶた
        dctx.fillRect(r.x, r.y, r.w, lid);                 // 上から
        dctx.fillRect(r.x, r.y + r.h - lo, r.w, lo);       // 下から
        dctx.fillStyle = 'rgba(70,45,30,0.45)';  // 合わせ目の細い陰
        dctx.fillRect(r.x, r.y + lid - 1, r.w, Math.max(1, 2 * close));
        dctx.restore();
      }
    }
  ];

  return {
    list,
    byId(id) { return list.find(m => m.id === id) || list[0]; }
  };
})();
