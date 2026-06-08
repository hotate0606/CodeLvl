const { app, BrowserWindow, ipcMain, screen, Tray, Menu, dialog, nativeImage, Notification } = require('electron');
const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const DATA_PATH   = path.join(app.getPath('userData'), 'data.json');
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// ---- XP設計 ----
const XP_BASE        = 10;   // コミット基本XP
const XP_BONUS_MAX   = 40;   // コード量ボーナスの上限
const XP_LINE_MIN    = 50;   // ボーナス発生の最小行数
const XP_LINE_CAP    = 3000; // ボーナス頭打ちの行数
const DAILY_XP_CAP   = 150;  // 1日のXP上限（荒稼ぎ防止）
const XP_BOOST_MULT  = 1.5;  // 課金ブースト倍率（XP・キャップ両方）

// コード変更量(churn)から獲得XPを算出
// XP = 10 + floor( 40 × √((行数-50) / 2950) )  ※50行未満は+0、3000行で頭打ち
function calcCommitXP(churn) {
  if (churn < XP_LINE_MIN) return XP_BASE;
  const capped = Math.min(churn, XP_LINE_CAP);
  const ratio  = (capped - XP_LINE_MIN) / (XP_LINE_CAP - XP_LINE_MIN);
  return XP_BASE + Math.floor(XP_BONUS_MAX * Math.sqrt(ratio));
}

// ---- レベル設計（指数：基準21 × 1.08^(Lv-1)）----
// Lv50で報酬上限（累計約11,000）、51以降も無限に上がる
const LV_BASE = 21;
const LV_MULT = 1.08;

// 累計XPからレベルを算出
function calcLevel(xp) {
  let level = 1;
  let need  = LV_BASE;     // Lv1→2 に必要なXP
  let acc   = 0;
  while (xp >= acc + need) {
    acc += need;
    level++;
    need = Math.round(LV_BASE * Math.pow(LV_MULT, level - 1));
  }
  return level;
}

// 指定レベルに到達するまでの累計XP
function cumulativeXP(level) {
  let acc = 0;
  for (let n = 1; n < level; n++) acc += Math.round(LV_BASE * Math.pow(LV_MULT, n - 1));
  return acc;
}

// そのレベルの「次のレベルまで必要なXP」
function xpForNextLevel(level) {
  return Math.round(LV_BASE * Math.pow(LV_MULT, level - 1));
}

// ---- ペットのデフォルト状態 ----
function defaultPetState() {
  return {
    affection:      60,
    condition:      80,
    hunger:         70,
    mood:           80,
    evolutionStage: 0,
    mutationType:    null,  // 'platinum' | 'glow' | 'jewel' | null
    bornPalette:    null,
    lastPetDate:    '',
    lastCommitDate: '',
    lastBadPetDate: '',    // 触られたくない場所をなでた最終日
    lastDecayTime:  Date.now(),
    coinPoolStart:  Date.now(),
    // キャラ固有レート（nullなら共通デフォルト。rendererがキャラ選択時に書き込む）
    decayRates:     null,
    evolutionLocked:     false, // ソフトロック中（たいかのアメ：トグル）
    evolutionHardLocked: false, // ハードロック中（せいちょうしたくないアメ：しんかのアメでしか解除不可）
  };
}

// ---- コミット量の算出 ----
function getCommitChurn(repoPath) {
  try {
    const out = execSync('git show HEAD --shortstat', { cwd: repoPath, encoding: 'utf8', timeout: 3000 });
    const ins = out.match(/(\d+) insertion/);
    const del = out.match(/(\d+) deletion/);
    return (ins ? parseInt(ins[1]) : 0) + (del ? parseInt(del[1]) : 0);
  } catch { return 0; }
}

// 前回コミットとの量比較で機嫌の変化量を算出
function calcMoodDelta(current, last) {
  if (last === 0) return 5;           // 初コミットは素直に喜ぶ
  const ratio = current / last;
  if (ratio >= 2.0) return 15;        // 前回の2倍以上 → 大はしゃぎ
  if (ratio >= 1.3) return 8;         // 1.3倍以上 → 上機嫌
  if (ratio >= 0.7) return 3;         // ほぼ同じ → 普通
  if (ratio >= 0.4) return -4;        // 少し少ない → 少し不満
  return -10;                          // かなり少ない → 不機嫌
}

// ---- データ管理（ゲームデータをdata.jsonに一本化）----
function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    return {
      xp: 0, totalCommits: 0, todayCommits: 0, lastDate: '',
      pet:     defaultPetState(),
      coins:   30,
      coinLog: [],          // コイン収支ログ（直近200件まで保持）
      slots:   1,           // キャラ枠（基本1、Lv15で2、課金で最大5）
      lastCommitChurn: 0,
      dailyXp:     0,       // 今日コミットで稼いだXP（キャップ判定用）
      dailyXpDate: '',      // dailyXpの対象日
      xpBoostUntil: 0,      // XPブーストの終了時刻(ms)。0=未使用
      coinPoolUnits: 3,     // コインプールの最大ユニット数（拡張アイテムで最大5）
      inventory: [],        // アイテムボックス [{ id, qty }]（ダブりはqtyでスタック）
    };
  }
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  // 旧データとの互換：不足フィールドを補完
  if (!data.pet)             data.pet             = defaultPetState();
  if (data.coins    == null) data.coins           = 30;
  if (!data.coinLog)         data.coinLog         = [];
  if (!data.slots)           data.slots           = 1;
  if (data.lastCommitChurn == null) data.lastCommitChurn = 0;
  if (data.dailyXp      == null) data.dailyXp      = 0;
  if (data.dailyXpDate  == null) data.dailyXpDate  = '';
  if (data.xpBoostUntil == null) data.xpBoostUntil = 0;
  if (data.coinPoolUnits == null) data.coinPoolUnits = 3;
  if (!data.inventory)           data.inventory     = [];
  // ペット状態の不足フィールドを補完
  const def = defaultPetState();
  for (const [k, v] of Object.entries(def)) {
    if (data.pet[k] == null) data.pet[k] = v;
  }
  return data;
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { watchPaths: [] };
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ---- ユーティリティ ----
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function todayString()    { return new Date().toISOString().slice(0, 10); }

// ---- 時間経過でのパラメータ減少 ----
// デフォルト: condition 12h-10 / hunger 8h-10 / mood 12h-5
// キャラ固有レートがdata.pet.decayRatesにあればそちらを優先（将来対応）
const DEFAULT_DECAY_PER_MS = {
  condition: 10 / (12 * 3600 * 1000),
  hunger:    10 / (8  * 3600 * 1000),
  mood:       5 / (12 * 3600 * 1000),
};

function applyDecay(data) {
  const now  = Date.now();
  const pet  = data.pet;
  if (!pet.lastDecayTime) { pet.lastDecayTime = now; return data; }
  const ms   = now - pet.lastDecayTime;
  // キャラ固有レートがあれば使う、なければデフォルト
  const rates = pet.decayRates
    ? {
        condition: pet.decayRates.condition / (3600 * 1000),
        hunger:    pet.decayRates.hunger    / (3600 * 1000),
        mood:      pet.decayRates.mood      / (3600 * 1000),
      }
    : DEFAULT_DECAY_PER_MS;
  for (const [key, rate] of Object.entries(rates)) {
    pet[key] = clamp((pet[key] ?? 80) - rate * ms, 0, 100);
  }
  pet.lastDecayTime = now;
  return data;
}

// ---- コイン収支ログ ----
function addCoinEntry(data, delta, reason) {
  data.coins = clamp((data.coins ?? 0) + delta, 0, 9999);
  data.coinLog = data.coinLog ?? [];
  data.coinLog.push({ time: Date.now(), delta, reason, balance: data.coins });
  if (data.coinLog.length > 200) data.coinLog = data.coinLog.slice(-200);
}

// ---- 通知 ----
const notifCooldown = {}; // { key: lastSentTimeMs }
const NOTIF_COOLDOWN_MS = 60 * 60 * 1000; // 同じ通知は1時間に1回まで

function tryNotif(key, body) {
  if (!Notification.isSupported()) return;
  const now = Date.now();
  if (notifCooldown[key] && now - notifCooldown[key] < NOTIF_COOLDOWN_MS) return;
  new Notification({ title: 'CodeLv', body }).show();
  notifCooldown[key] = now;
}

function checkNotifications(pet, coins, coinPoolStart, coinPoolUnits) {
  if (pet.hunger    < 25) tryNotif('hunger',    'おなかすいてるよ！ ごはんあげて🍖');
  if (pet.condition < 20) tryNotif('condition', 'げんきがなくなってきた… コードかこ！');
  if (pet.mood      < 20) tryNotif('mood',      'きげんわるいよ… ごはんあげて🍖');
  // コインが満タン（最大ユニット×10分 経過）のとき
  const COIN_FULL_MS = (coinPoolUnits ?? 3) * 10 * 60 * 1000;
  if (Date.now() - (coinPoolStart ?? 0) >= COIN_FULL_MS) {
    tryNotif('coinFull', 'コインが満タンだよ！ うけとってね🪙');
  }
}

// ---- XP付与 ----
function awardXP(_amount, reason, repoPath) {
  const data  = loadData();
  const today = todayString();
  const now   = Date.now();

  if (data.lastDate !== today) { data.todayCommits = 0; data.lastDate = today; }
  // デイリーXPの日付が変わっていたらリセット
  if (data.dailyXpDate !== today) { data.dailyXp = 0; data.dailyXpDate = today; }

  // コミット量（churn）を取得 → XPと機嫌変化を算出
  const churn     = repoPath ? getCommitChurn(repoPath) : 0;
  const moodDelta = calcMoodDelta(churn, data.lastCommitChurn ?? 0);
  data.lastCommitChurn = churn;

  // 基本XPを算出
  let gained = calcCommitXP(churn);

  // ブースト中ならXP1.5倍＋デイリーキャップも1.5倍
  const boosted = now < (data.xpBoostUntil ?? 0);
  if (boosted) gained = Math.round(gained * XP_BOOST_MULT);
  const cap = boosted ? Math.round(DAILY_XP_CAP * XP_BOOST_MULT) : DAILY_XP_CAP;

  // デイリーキャップ適用：今日の残り枠ぶんだけ反映
  const room      = Math.max(0, cap - data.dailyXp);
  const actualXp  = Math.min(gained, room);
  const capped    = actualXp < gained; // キャップに当たったか

  data.xp           += actualXp;
  data.dailyXp      += actualXp;
  data.totalCommits += 1;
  data.todayCommits += 1;

  saveData(data);

  const level = calcLevel(data.xp);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('update-stats', { ...data, level, xpForNext: xpForNextLevel(level) });
    overlayWindow.webContents.send('xp-gained', {
      reason, moodDelta, churn,
      xp: actualXp, capped, boosted,
    });
  }
}

// ---- gitコミット監視 ----
const watchers = new Map();

function watchRepo(repoPath) {
  const commitMsgPath = path.join(repoPath, '.git', 'COMMIT_EDITMSG');
  if (!fs.existsSync(commitMsgPath)) return false;
  if (watchers.has(repoPath)) return true;

  let lastMtime = fs.statSync(commitMsgPath).mtimeMs;
  const watcher = fs.watch(commitMsgPath, () => {
    try {
      const mtime = fs.statSync(commitMsgPath).mtimeMs;
      if (mtime !== lastMtime) { lastMtime = mtime; awardXP(XP_PER_COMMIT, path.basename(repoPath), repoPath); }
    } catch {}
  });
  watchers.set(repoPath, watcher);
  return true;
}

function unwatchRepo(repoPath) {
  const watcher = watchers.get(repoPath);
  if (watcher) { watcher.close(); watchers.delete(repoPath); }
}

function startWatchingAll() {
  const config = loadConfig();
  for (const p of config.watchPaths) watchRepo(p);
}

// ---- ウィンドウ ----
let overlayWindow;
let tray;

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winW = 540, winH = 358;

  overlayWindow = new BrowserWindow({
    width: winW, height: winH,
    x: width - winW - 16, y: height - winH - 16,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createTrayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inCircle = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2) < 6.5;
      buf[i]     = inCircle ? 80  : 0;
      buf[i + 1] = inCircle ? 200 : 0;
      buf[i + 2] = inCircle ? 120 : 0;
      buf[i + 3] = inCircle ? 255 : 0;
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : createTrayIcon();
  tray = new Tray(icon);

  function buildMenu() {
    const config = loadConfig();
    return Menu.buildFromTemplate([
      { label: 'CodeLv', enabled: false },
      { type: 'separator' },
      {
        label: 'リポジトリを追加...',
        click: async () => {
          const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
          if (!result.canceled && result.filePaths[0]) {
            const chosen = result.filePaths[0];
            const config = loadConfig();
            if (!config.watchPaths.includes(chosen)) {
              if (watchRepo(chosen)) {
                config.watchPaths.push(chosen);
                saveConfig(config);
                tray.setContextMenu(buildMenu());
              } else {
                dialog.showMessageBox({ message: 'gitリポジトリが見つかりませんでした。' });
              }
            }
          }
        },
      },
      { type: 'separator' },
      ...config.watchPaths.map((p) => ({ label: `📁 ${path.basename(p)}`, enabled: false })),
      { type: 'separator' },
      { label: '終了', click: () => app.quit() },
    ]);
  }

  tray.setToolTip('CodeLv');
  tray.setContextMenu(buildMenu());
}

// ---- 起動 ----
app.whenReady().then(() => {
  createOverlay();
  createTray();
  startWatchingAll();

  // 起動時にdecay適用・通知チェック
  const data = applyDecay(loadData());
  saveData(data);
  checkNotifications(data.pet, data.coins, data.pet.coinPoolStart, data.coinPoolUnits);

  const level = calcLevel(data.xp);
  overlayWindow.webContents.on('did-finish-load', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('update-stats', { ...data, level, xpForNext: xpForNextLevel(level) });
    }
  });

  // 10分ごとにdecay適用・通知チェック
  setInterval(() => {
    const d = applyDecay(loadData());
    saveData(d);
    checkNotifications(d.pet, d.coins, d.pet.coinPoolStart, d.coinPoolUnits);
    // decayの結果をrendererに反映
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('decay-tick', d.pet);
  }, 10 * 60 * 1000);
});

// ---- IPC ----

ipcMain.handle('get-stats', () => {
  const data = loadData();
  const level = calcLevel(data.xp);
  return { ...data, level, xpForNext: xpForNextLevel(level) };
});

// ゲーム状態まとめて取得（decay適用済み）
ipcMain.handle('get-game-state', () => {
  const data = applyDecay(loadData());
  saveData(data);
  const level = calcLevel(data.xp);
  return { ...data, level, xpForNext: xpForNextLevel(level) };
});

// ペット状態を保存
ipcMain.handle('save-pet-state', (_, petState) => {
  const data = loadData();
  data.pet = { ...data.pet, ...petState };
  saveData(data);
});

// コイン変動を保存（ログも記録）
ipcMain.handle('save-coins', (_, { coins, delta, reason }) => {
  const data = loadData();
  data.coins = clamp(coins, 0, 9999);
  if (delta != null && reason != null) {
    data.coinLog = data.coinLog ?? [];
    data.coinLog.push({ time: Date.now(), delta, reason, balance: data.coins });
    if (data.coinLog.length > 200) data.coinLog = data.coinLog.slice(-200);
  }
  saveData(data);
});

// キャラ枠数を取得
ipcMain.handle('get-slots', () => {
  return loadData().slots ?? 1;
});

// キャラ枠を購入（課金処理は将来。現状はデバッグ・テスト用）
ipcMain.handle('update-slots', (_, count) => {
  const data = loadData();
  data.slots = clamp(count, 1, 5); // 最大5枠
  saveData(data);
  return data.slots;
});

// XPブースト発動（1.5h・XPとデイリーキャップ1.5倍）
ipcMain.handle('activate-xp-boost', (_, durationMs = 90 * 60 * 1000) => {
  const data = loadData();
  const now  = Date.now();
  // 残り時間がある場合は延長
  const base = Math.max(now, data.xpBoostUntil ?? 0);
  data.xpBoostUntil = base + durationMs;
  saveData(data);
  return data.xpBoostUntil;
});

// コインプール拡張（最大ユニットを+1、上限5＝50分50コイン）
ipcMain.handle('expand-coin-pool', () => {
  const data = loadData();
  data.coinPoolUnits = clamp((data.coinPoolUnits ?? 3) + 1, 3, 5);
  saveData(data);
  return data.coinPoolUnits;
});

// ---- アイテムボックス ----
ipcMain.handle('get-inventory', () => loadData().inventory ?? []);

// アイテム追加（同一idはqtyでスタック）
ipcMain.handle('add-item', (_, { id, qty = 1 }) => {
  const data = loadData();
  data.inventory = data.inventory ?? [];
  const ex = data.inventory.find((i) => i.id === id);
  if (ex) ex.qty += qty;
  else data.inventory.push({ id, qty });
  saveData(data);
  return data.inventory;
});

// アイテム消費（qty減算、0以下で除去）
ipcMain.handle('remove-item', (_, { id, qty = 1 }) => {
  const data = loadData();
  const ex = (data.inventory ?? []).find((i) => i.id === id);
  if (ex) {
    ex.qty -= qty;
    if (ex.qty <= 0) data.inventory = data.inventory.filter((i) => i.id !== id);
  }
  saveData(data);
  return data.inventory;
});

app.on('window-all-closed', (e) => e.preventDefault());
