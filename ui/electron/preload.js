// Preload: cau noi an toan duy nhat giua React (renderer) va Electron (main).
// Renderer khong cham truc tiep vao Node/Electron, chi goi qua window.councilApi
// (view/clipboard) va window.councilFs (file he thong — xem electron/fsApi.js).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('councilApi', {
  layoutViews: (payload) => ipcRenderer.invoke('views:layout', payload),
  hideViews: () => ipcRenderer.invoke('views:hide'),
  reloadBot: (botId) => ipcRenderer.invoke('views:reload', botId),
  extractAnswer: (botId) => ipcRenderer.invoke('views:extract-answer', botId),
  newSession: (botId) => ipcRenderer.invoke('views:new-session', botId),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard:write', text),
  clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
  saveTextFile: (filename, content) => ipcRenderer.invoke('file:save-text', { filename, content }),
});

// File he thong: moi ham deu di qua IPC cua main process — main chi ghi/xoa
// trong thu muc lam viec nguoi dung da chon, doc file ngoai chi khi nguoi
// dung tu chon bang hop thoai hoac keo-tha vao app.
// Gemini API (dieu phoi): renderer gui kem API key theo tung lan goi;
// main process moi la noi goi Google API that.
contextBridge.exposeInMainWorld('councilGemini', {
  generate: (payload) => ipcRenderer.invoke('gemini:generate', payload),
});

contextBridge.exposeInMainWorld('councilFs', {
  getState: () => ipcRenderer.invoke('fs:get-state'),
  chooseWorkDir: () => ipcRenderer.invoke('fs:choose-workdir'),
  ensureSession: (folderName, files) => ipcRenderer.invoke('fs:ensure-session', { folderName, files }),
  writeSessionFile: (sessionDir, name, content, activity) => ipcRenderer.invoke('fs:write-session-file', { sessionDir, name, content, activity }),
  appendActivity: (sessionDir, text) => ipcRenderer.invoke('fs:append-activity', { sessionDir, text }),
  listSessionFiles: (sessionDir) => ipcRenderer.invoke('fs:list-session-files', { sessionDir }),
  readSessionJson: (sessionDir) => ipcRenderer.invoke('fs:read-session-json', { sessionDir }),
  openSessionDialog: () => ipcRenderer.invoke('fs:open-session-dialog'),
  openContextDialog: () => ipcRenderer.invoke('fs:open-context-dialog'),
  readPath: (filePath) => ipcRenderer.invoke('fs:read-path', { filePath }),
  openPath: (targetPath) => ipcRenderer.invoke('fs:open-path', { targetPath }),
  showInFolder: (targetPath) => ipcRenderer.invoke('fs:show-in-folder', { targetPath }),
  trash: (targetPath) => ipcRenderer.invoke('fs:trash', { targetPath }),
  watchSession: (sessionDir) => ipcRenderer.invoke('fs:watch-session', { sessionDir }),
  // Electron >= 32 bo File.path — lay duong dan that cua file keo-tha bang webUtils.
  getDroppedFilePath: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return ''; } },
  onChanged: (callback) => {
    const handler = (_e, payload) => callback(payload);
    ipcRenderer.on('fs:changed', handler);
    return () => ipcRenderer.removeListener('fs:changed', handler);
  },
});
