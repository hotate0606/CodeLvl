const { app, BrowserWindow, ipcMain, screen, Tray, Menu, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_PATH = path.join(app.getPath('userData'), 'data.json');
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const XP_PER_COMMIT = 50;

// ---- データ管理 ----

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    return { xp: 0, totalCommits: 0, todayCommits: 0, lastDate: '' };
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { watchPaths: [] };
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function calcLevel(xp) {
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}

function xpForNextLevel(level) {
  return 50 * level * level;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

// ---- XP付与 ----

function awardXP(amount, reason) {
  const data = loadData();
  const today = todayString();

  if (data.lastDate !== today) {
    data.todayCommits = 0;
    data.lastDate = today;
  }

  data.xp += amount;
  data.totalCommits += 1;
  data.todayCommits += 1;
  saveData(data);

  const level = calcLevel(data.xp);
  if (overlayWindow) {
    overlayWindow.webContents.send('update-stats', {
      ...data,
      level,
      xpForNext: xpForNextLevel(level),
    });
    overlayWindow.webContents.send('xp-gained', { amount, reason });
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
      if (mtime !== lastMtime) {
        lastMtime = mtime;
        awardXP(XP_PER_COMMIT, path.basename(repoPath));
      }
    } catch {}
  });

  watchers.set(repoPath, watcher);
  return true;
}

function unwatchRepo(repoPath) {
  const watcher = watchers.get(repoPath);
  if (watcher) {
    watcher.close();
    watchers.delete(repoPath);
  }
}

function startWatchingAll() {
  const config = loadConfig();
  for (const p of config.watchPaths) {
    watchRepo(p);
  }
}

// ---- ウィンドウ ----

let overlayWindow;
let tray;

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 280,
    height: 140,
    x: width - 296,
    y: height - 156,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function createTrayIcon() {
  // 16x16の緑のアイコンを動的生成
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inCircle = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2) < 6.5;
      buf[i]     = inCircle ? 80  : 0;   // R
      buf[i + 1] = inCircle ? 200 : 0;   // G
      buf[i + 2] = inCircle ? 120 : 0;   // B
      buf[i + 3] = inCircle ? 255 : 0;   // A
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : createTrayIcon();
  tray = new Tray(icon);

  function buildMenu() {
    const config = loadConfig();
    const repoItems = config.watchPaths.map((p) =>
      Menu.buildFromTemplate([]).constructor.buildFromTemplate
        ? { label: `✓ ${path.basename(p)}`, enabled: false }
        : { label: p, enabled: false }
    );

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
      ...config.watchPaths.map((p) => ({
        label: `📁 ${path.basename(p)}`,
        enabled: false,
      })),
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

  const data = loadData();
  const level = calcLevel(data.xp);
  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('update-stats', {
      ...data,
      level,
      xpForNext: xpForNextLevel(level),
    });
  });
});

ipcMain.handle('get-stats', () => {
  const data = loadData();
  const level = calcLevel(data.xp);
  return { ...data, level, xpForNext: xpForNextLevel(level) };
});

app.on('window-all-closed', (e) => e.preventDefault());
