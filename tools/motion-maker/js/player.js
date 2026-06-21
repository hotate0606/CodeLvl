// ============================================================
// player.js  ―― 再生/停止ループ
// ------------------------------------------------------------
// フレーム配列を指定の速さ(fps)でめくり、今のコマ番号を
// onDraw(index) で知らせるだけのシンプルな再生機。
// 実際の描画(市松＋コマ)は app.js 側で行う。
// ============================================================

window.SM = window.SM || {};
SM.player = (function () {
  let raf = null;
  let idx = 0;
  let last = 0;
  let acc = 0; // 経過時間の貯金（ms）

  // getFrames: 現在のフレーム配列を返す関数 / fps: 1秒あたりのコマ数
  // onDraw: コマ番号を受け取って描画するコールバック
  function start(getFrames, fps, onDraw) {
    stop();
    last = performance.now();
    acc = 0;
    const step = (now) => {
      const frames = getFrames();
      const n = Math.max(1, frames.length);
      const spf = 1000 / Math.max(1, fps); // 1コマの表示時間(ms)
      acc += now - last;
      last = now;
      while (acc >= spf) { acc -= spf; idx = (idx + 1) % n; }
      onDraw(idx % n);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  function reset() { idx = 0; acc = 0; }

  return {
    start, stop, reset,
    get index() { return idx; },
    get playing() { return raf !== null; }
  };
})();
