// ============================================================
// exporter.js  ―― 書き出し（スプライトシート / 個別PNG）
// ------------------------------------------------------------
// どちらも透明背景のまま PNG で保存する。
// （市松模様はプレビュー表示だけのもので、保存画像には入らない）
// ============================================================

window.SM = window.SM || {};
SM.exporter = (function () {

  // フレームを横一列に並べた1枚のキャンバスを作る
  function buildSheet(frames) {
    if (!frames.length) return null;
    const fw = frames[0].width, fh = frames[0].height;
    const sheet = SM.frames.makeCanvas(fw * frames.length, fh);
    const ctx = sheet.getContext('2d');
    frames.forEach((f, i) => ctx.drawImage(f, i * fw, 0));
    return sheet;
  }

  // canvas を PNG としてダウンロード
  function download(canvas, name) {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  function saveSheet(frames, base) {
    const sheet = buildSheet(frames);
    if (sheet) download(sheet, `${base || 'motion'}_sheet_${frames.length}.png`);
  }

  // 個別保存：ブラウザが連続ダウンロードを許可していれば一気に落ちる
  function saveEach(frames, base) {
    frames.forEach((f, i) => {
      const name = `${base || 'motion'}_${String(i + 1).padStart(2, '0')}.png`;
      setTimeout(() => download(f, name), i * 250); // 少しずつ間隔をあける
    });
  }

  return { buildSheet, download, saveSheet, saveEach };
})();
