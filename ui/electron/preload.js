// Preload: cau noi an toan duy nhat giua React (renderer) va Electron (main).
// Renderer khong cham truc tiep vao Node/Electron, chi goi qua window.councilApi.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('councilApi', {
  layoutViews: (payload) => ipcRenderer.invoke('views:layout', payload),
  hideViews: () => ipcRenderer.invoke('views:hide'),
  reloadBot: (botId) => ipcRenderer.invoke('views:reload', botId),
  newSession: (botId) => ipcRenderer.invoke('views:new-session', botId),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard:write', text),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  saveTextFile: (filename, content) => ipcRenderer.invoke('file:save-text', { filename, content }),
});
