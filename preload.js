const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codelvl', {
  // 既存
  getStats:       () => ipcRenderer.invoke('get-stats'),
  onUpdateStats:  (cb) => ipcRenderer.on('update-stats', (_, data) => cb(data)),
  onXpGained:     (cb) => ipcRenderer.on('xp-gained',   (_, data) => cb(data)),

  // ゲームデータ（data.jsonに一本化）
  getGameState:   () => ipcRenderer.invoke('get-game-state'),
  savePetState:   (state)  => ipcRenderer.invoke('save-pet-state', state),
  saveCoins:      (payload) => ipcRenderer.invoke('save-coins', payload),
  getSlots:       () => ipcRenderer.invoke('get-slots'),
  updateSlots:    (n) => ipcRenderer.invoke('update-slots', n),

  // 課金アイテム系
  activateXpBoost: (ms) => ipcRenderer.invoke('activate-xp-boost', ms),
  expandCoinPool:  () => ipcRenderer.invoke('expand-coin-pool'),

  // 定期decayをrendererに通知
  onDecayTick:    (cb) => ipcRenderer.on('decay-tick', (_, pet) => cb(pet)),
});
