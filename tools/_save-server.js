// 一時的な保存サーバー：recolor.html の変換結果を renderer/assets/モーション/ に書き出す。
// 使い捨て（作業が終わったら止めて削除してよい）。
const http = require('http');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'renderer', 'assets');
const DIRS = { // 保存先ホワイトリスト
  '': ASSETS,
  'モーション': path.join(ASSETS, 'モーション'),
  'ニシアフ': path.join(ASSETS, 'ニシアフ'),
  '_diag': path.join(__dirname, '_diag'),
};

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method === 'POST' && req.url.startsWith('/save')) {
    const u = new URL(req.url, 'http://localhost');
    const name = path.basename(decodeURIComponent(u.searchParams.get('name') || 'out.png'));
    const dir = DIRS[decodeURIComponent(u.searchParams.get('dir') || '')];
    if (!dir) { res.statusCode = 400; res.end('bad dir'); return; }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, Buffer.concat(chunks));
      console.log('saved:', file, Buffer.concat(chunks).length, 'bytes');
      res.end('ok: ' + name);
    });
  } else {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(35799, () => console.log('save server on http://localhost:35799'));
