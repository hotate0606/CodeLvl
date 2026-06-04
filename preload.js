const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codelvl', {
  getStats: () => ipcRenderer.invoke('get-stats'),
  onUpdateStats: (cb) => ipcRenderer.on('update-stats', (_, data) => cb(data)),
  onXpGained: (cb) => ipcRenderer.on('xp-gained', (_, data) => cb(data)),
});
