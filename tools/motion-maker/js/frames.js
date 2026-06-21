// ============================================================
// frames.js  ―― 下ごしらえ と フレーム生成
// ------------------------------------------------------------
// ・元画像のまわりに少し余白(pad)を足した「フレーム」を用意する
//   （上下に伸びる/浮く動きが端で切れないようにするため）
// ・範囲(しっぽ/翼/目)が指定されたら、切り抜きパッチ・穴あき土台・
//   回転の支点・まばたき用の肌色を前もって作っておく
// ・モーションを使って frames（1コマずつのcanvas配列）を作る
// ============================================================

window.SM = window.SM || {};
SM.frames = (function () {

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  // 元画像(source canvas)と範囲(region: 元画像座標 {x,y,w,h} か null)から
  // モーションが使う「フレーム文脈(fc)」を作る。
  function buildContext(source, region) {
    const srcW = source.width, srcH = source.height;
    const pad = Math.max(8, Math.round(Math.max(srcW, srcH) * 0.12)); // 余白
    const frameW = srcW + pad * 2, frameH = srcH + pad * 2;

    // 元画像を pad だけずらして置いた土台（以降この“フレーム座標”で扱う）
    const srcFrame = makeCanvas(frameW, frameH);
    srcFrame.getContext('2d').drawImage(source, pad, pad);

    const fc = {
      src: srcFrame, srcW, srcH, frameW, frameH, pad,
      region: null, patch: null, baseHole: srcFrame, pivot: null,
      skin: 'rgb(220,200,170)'
    };

    if (region && region.w > 2 && region.h > 2) {
      // フレーム座標へ（padぶんずらす）
      const rf = { x: region.x + pad, y: region.y + pad, w: region.w, h: region.h };
      fc.region = rf;

      // 範囲だけ切り抜いたパッチ
      const patch = makeCanvas(rf.w, rf.h);
      patch.getContext('2d').drawImage(srcFrame, rf.x, rf.y, rf.w, rf.h, 0, 0, rf.w, rf.h);
      fc.patch = patch;

      // 範囲を抜いた土台（動かない部分）
      const hole = makeCanvas(frameW, frameH);
      const hctx = hole.getContext('2d');
      hctx.drawImage(srcFrame, 0, 0);
      hctx.clearRect(rf.x, rf.y, rf.w, rf.h);
      fc.baseHole = hole;

      // 回転の支点＝範囲の「画像中心に近い側の辺」の中点（付け根の近似）
      fc.pivot = attachPivot(rf, frameW, frameH);

      // まばたき用の肌色＝範囲のすぐ上の帯から不透明画素の平均
      fc.skin = sampleSkin(srcFrame, rf);
    }
    return fc;
  }

  // 付け根の支点を推定：範囲が中心の左右どちらかに寄っていれば縦辺、
  // 上下に寄っていれば横辺の中点を使う。
  function attachPivot(r, frameW, frameH) {
    const cx = frameW / 2, cy = frameH / 2;
    const rcx = r.x + r.w / 2, rcy = r.y + r.h / 2;
    if (Math.abs(rcx - cx) >= Math.abs(rcy - cy)) {
      const x = (rcx < cx) ? (r.x + r.w) : r.x; // 中心に近い縦辺
      return { x, y: rcy };
    } else {
      const y = (rcy < cy) ? (r.y + r.h) : r.y; // 中心に近い横辺
      return { x: rcx, y };
    }
  }

  // 範囲の少し上の帯を読み、不透明画素の平均色を返す（まばたきのまぶた色）。
  function sampleSkin(srcFrame, r) {
    const ctx = srcFrame.getContext('2d');
    const y0 = Math.max(0, r.y - Math.round(r.h * 0.4));
    const h = Math.max(1, r.y - y0);
    let data;
    try {
      data = ctx.getImageData(r.x, y0, r.w, h).data;
    } catch (e) {
      return 'rgb(220,200,170)'; // 読めなければ無難な肌色
    }
    let cr = 0, cg = 0, cb = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 180) { cr += data[i]; cg += data[i + 1]; cb += data[i + 2]; n++; }
    }
    if (!n) return 'rgb(220,200,170)';
    return `rgb(${Math.round(cr / n)},${Math.round(cg / n)},${Math.round(cb / n)})`;
  }

  // モーションで frames（1コマずつのcanvas配列）を作る。
  // count: フレーム数 / strength: 0〜100
  function build(fc, motion, count, strength) {
    const out = [];
    const s = strength / 100;
    for (let i = 0; i < count; i++) {
      const t = i / count;                       // 0〜1（1周ぶん）
      const c = makeCanvas(fc.frameW, fc.frameH);
      motion.apply(c.getContext('2d'), fc, t, s);
      out.push(c);
    }
    return out;
  }

  return { buildContext, build, makeCanvas };
})();
