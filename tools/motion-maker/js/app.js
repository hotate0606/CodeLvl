// ============================================================
// app.js  ―― 画面の配線・全体制御
// ------------------------------------------------------------
// やること：
//  1) 画像の読み込み（ドラッグ＆ドロップ / ファイル選択）
//  2) 左キャンバスのプレビュー描画（市松＋コマ＋範囲枠）
//  3) 範囲のドラッグ選択
//  4) モーション選択・スライダー・フレーム数の反映
//  5) 再生/停止・保存
// ============================================================

window.SM = window.SM || {};
(function () {
  // ---- 画面の状態 ----
  const state = {
    source: null,      // 元画像(canvas)
    fileName: 'motion',
    region: null,      // 範囲（元画像座標 {x,y,w,h}）
    motionId: 'breath',
    frames: 8,
    strength: 35,
    fps: 12,
    zoom: 1,
    fc: null,          // フレーム文脈（frames.js）
    built: [],         // 生成済みフレーム配列
    selecting: false,  // 範囲ドラッグ中モード
    drag: null         // ドラッグ中の矩形
  };

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  let canvas, ctx, checker;
  let view = { fit: 1, ox: 0, oy: 0 }; // フレーム→画面 の変換（範囲計算に使う）

  // DOMがまだ読み込み中なら待つ。読み込み済みならすぐ初期化（読み込み順に強い）。
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  function init() {
    canvas = $('preview');
    ctx = canvas.getContext('2d');
    checker = makeChecker();

    buildMotionButtons();
    bindTopButtons();
    bindFileLoading();
    bindRegionMouse();
    bindControls();

    applyMotionDefaults(SM.motions.byId(state.motionId), false);
    syncControls();
    render();
    window.addEventListener('resize', render);
  }

  // ---------- モーション選択ボタン ----------
  function buildMotionButtons() {
    const wrap = $('motionList');
    SM.motions.list.forEach((m) => {
      const b = document.createElement('button');
      b.className = 'motion-btn';
      b.dataset.id = m.id;
      b.textContent = m.name;
      b.onclick = () => selectMotion(m.id);
      wrap.appendChild(b);
    });
  }

  function selectMotion(id) {
    state.motionId = id;
    const m = SM.motions.byId(id);
    applyMotionDefaults(m, true);   // プリセット値を反映
    state.region = null;            // 動きを変えたら範囲はリセット
    state.selecting = false;
    syncControls();
    rebuild();
    updateHints();
  }

  // プリセット（各モーションの defaults）を state に反映
  function applyMotionDefaults(m, overwrite) {
    if (!overwrite && state._presetDone) return;
    state.frames = m.defaults.frames;
    state.strength = m.defaults.strength;
    state.fps = m.defaults.fps;
    state._presetDone = true;
  }

  // ---------- 上部の大きいボタン ----------
  function bindTopButtons() {
    $('btnPlay').onclick = togglePlay;
    $('btnSaveSheet').onclick = () => state.built.length && SM.exporter.saveSheet(state.built, sheetBase());
  }

  function sheetBase() {
    return `${state.fileName}_${state.motionId}`;
  }

  function togglePlay() {
    if (SM.player.playing) {
      SM.player.stop();
      $('btnPlay').textContent = '▶ プレビュー再生';
    } else {
      if (!state.built.length) return;
      SM.player.start(() => state.built, state.fps, () => render());
      $('btnPlay').textContent = '■ 停止';
    }
  }

  // ---------- 画像の読み込み ----------
  function bindFileLoading() {
    const input = $('fileInput');
    $('btnLoad').onclick = () => input.click();
    input.onchange = (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); };

    const drop = $('previewWrap');
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.remove('dragging');
    }));
    drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
  }

  function loadFile(file) {
    if (!/image\/png|image\//.test(file.type)) { alert('PNG画像を読み込んでください'); return; }
    state.fileName = file.name.replace(/\.[^.]+$/, '') || 'motion';
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = SM.frames.makeCanvas(img.width, img.height);
        c.getContext('2d').drawImage(img, 0, 0);
        state.source = c;
        state.region = null;
        SM.player.stop(); $('btnPlay').textContent = '▶ プレビュー再生';
        rebuild();
        updateHints();
      };
      img.src = reader.result; // dataURL（透過を保持・キャンバスを汚さない）
    };
    reader.readAsDataURL(file);
  }

  // ---------- 範囲ドラッグ ----------
  function bindRegionMouse() {
    $('btnSelect').onclick = () => {
      if (!state.source) return;
      state.selecting = true;
      updateHints();
      render();
    };
    $('btnClearRegion').onclick = () => {
      state.region = null; state.selecting = false;
      rebuild(); updateHints();
    };

    canvas.addEventListener('mousedown', (e) => {
      if (!state.selecting) return;
      const p = toSource(e);
      state.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!state.drag) return;
      const p = toSource(e);
      state.drag.x1 = p.x; state.drag.y1 = p.y;
      render();
    });
    window.addEventListener('mouseup', () => {
      if (!state.drag) return;
      const d = state.drag; state.drag = null;
      const r = normRect(d);
      if (r.w > 3 && r.h > 3) {
        state.region = r;
        state.selecting = false;
        rebuild();
      }
      updateHints();
      render();
    });
  }

  // 画面座標 → 元画像座標
  function toSource(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const fx = (mx - view.ox) / view.fit; // フレーム座標
    const fy = (my - view.oy) / view.fit;
    const pad = state.fc ? state.fc.pad : 0;
    return {
      x: clamp(fx - pad, 0, state.source ? state.source.width : 0),
      y: clamp(fy - pad, 0, state.source ? state.source.height : 0)
    };
  }

  function normRect(d) {
    return {
      x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1),
      w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0)
    };
  }

  // ---------- スライダー等 ----------
  function bindControls() {
    $('strength').oninput = (e) => { state.strength = +e.target.value; $('strengthVal').textContent = state.strength; rebuild(); };
    $('fps').oninput = (e) => { state.fps = +e.target.value; $('fpsVal').textContent = state.fps; };
    $('zoom').oninput = (e) => { state.zoom = +e.target.value / 100; render(); };
    $('btnSaveEach').onclick = () => state.built.length && SM.exporter.saveEach(state.built, sheetBase());

    document.querySelectorAll('.frame-btn').forEach((b) => {
      b.onclick = () => {
        state.frames = +b.dataset.n;
        document.querySelectorAll('.frame-btn').forEach(x => x.classList.toggle('active', x === b));
        rebuild();
      };
    });
  }

  // state を各UIに反映
  function syncControls() {
    $('strength').value = state.strength; $('strengthVal').textContent = state.strength;
    $('fps').value = state.fps; $('fpsVal').textContent = state.fps;
    document.querySelectorAll('.frame-btn').forEach(x => x.classList.toggle('active', +x.dataset.n === state.frames));
    document.querySelectorAll('.motion-btn').forEach(x => x.classList.toggle('active', x.dataset.id === state.motionId));
  }

  // ---------- 生成 ----------
  function rebuild() {
    if (!state.source) { state.built = []; render(); return; }
    const m = SM.motions.byId(state.motionId);
    const region = m.needsRegion ? state.region : null;
    state.fc = SM.frames.buildContext(state.source, region);
    state.built = SM.frames.build(state.fc, m, state.frames, state.strength);
    SM.player.reset();
    render();
  }

  // ---------- 描画 ----------
  function render() {
    fitCanvasToBox();
    // 市松背景
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = checker;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!state.source || !state.fc) { drawCenterText('ここに PNG をドラッグ＆ドロップ'); return; }

    const fc = state.fc;
    const fit = Math.min(canvas.width / fc.frameW, canvas.height / fc.frameH) * state.zoom;
    const dispW = fc.frameW * fit, dispH = fc.frameH * fit;
    view = { fit, ox: (canvas.width - dispW) / 2, oy: (canvas.height - dispH) / 2 };

    // 現在のコマ（再生中は player.index、停止中は先頭）
    const frame = state.built[SM.player.playing ? SM.player.index : 0] || fc.src;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, view.ox, view.oy, dispW, dispH);

    // 範囲枠・支点（停止中だけ）
    if (!SM.player.playing) drawRegionOverlay();
  }

  function drawRegionOverlay() {
    const fc = state.fc, pad = fc.pad;
    // ドラッグ中の仮枠
    const r = state.drag ? normRect(state.drag) : state.region;
    if (!r) return;
    const sx = view.ox + (r.x + pad) * view.fit;
    const sy = view.oy + (r.y + pad) * view.fit;
    const sw = r.w * view.fit, sh = r.h * view.fit;
    ctx.save();
    ctx.strokeStyle = '#1e88e5';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.fillStyle = 'rgba(30,136,229,0.12)';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.restore();
    // 支点
    if (state.fc.pivot && !state.drag) {
      const px = view.ox + state.fc.pivot.x * view.fit;
      const py = view.oy + state.fc.pivot.y * view.fit;
      ctx.fillStyle = '#e53935';
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCenterText(text) {
    ctx.fillStyle = '#7a8aa0';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  // キャンバスの実ピクセルを表示サイズに合わせる（ぼけ防止）
  function fitCanvasToBox() {
    const box = $('previewWrap');
    const w = box.clientWidth, h = box.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  // ---------- ヒント（手順の案内） ----------
  function updateHints() {
    const m = SM.motions.byId(state.motionId);
    const regionRow = $('regionRow');
    regionRow.style.display = m.needsRegion ? '' : 'none';

    let msg;
    if (!state.source) msg = 'まず「画像を読み込む」から PNG を読み込みましょう。';
    else if (m.needsRegion && !state.region) {
      msg = state.selecting
        ? `${m.regionLabel}のあたりをマウスでドラッグして囲ってください。`
        : `「${m.regionLabel}の範囲を選ぶ」を押して、動かす場所を囲ってください。`;
    } else {
      msg = '「▶ プレビュー再生」で動きを確認 → よければ「保存」しましょう。強さスライダーで調整できます。';
    }
    $('hint').textContent = msg;
    $('regionState').textContent = state.region ? '範囲：指定済み' : '範囲：未指定';
    markStep(m);
  }

  function markStep(m) {
    let step = 1;
    if (state.source) step = 2;
    if (state.source && (!m.needsRegion || state.region)) step = 4;
    if (state.source && m.needsRegion && state.selecting) step = 3;
    document.querySelectorAll('.step').forEach((el) => {
      el.classList.toggle('on', +el.dataset.step <= step);
    });
  }

  // ---------- 部品 ----------
  function makeChecker() {
    const s = 10;
    const c = SM.frames.makeCanvas(s * 2, s * 2);
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, s * 2, s * 2);
    x.fillStyle = '#e6ebf2';
    x.fillRect(0, 0, s, s); x.fillRect(s, s, s, s);
    return ctx.createPattern(c, 'repeat');
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
})();
