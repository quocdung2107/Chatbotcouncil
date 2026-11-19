// Electron main process — Chat Hoi Dong UI
// Nhiem vu: 1 cua so duy nhat, ben trong chua 4 WebContentsView (1 cho moi
// chatbot). Moi view co partition rieng (persist:council-<id>) nen dang nhap
// duoc luu tren dia, tat app mo lai van con. App chi mo/an cac view va xu ly
// clipboard + luu file; viec dan prompt, bam Gui, copy dap an van do nguoi
// dung lam tay trong tung trang chatbot (ban tu dong, dung chinh sach).
const { app, BrowserWindow, WebContentsView, ipcMain, clipboard, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

const BOTS = [
  { id: 'chatgpt', url: 'https://chatgpt.com/' },
  { id: 'claude', url: 'https://claude.ai/' },
  { id: 'gemini', url: 'https://gemini.google.com/app' },
  { id: 'copilot', url: 'https://copilot.microsoft.com/' },
];

let win = null;
const views = new Map(); // id -> WebContentsView

// Khai bao nhu Chrome that tren Windows: User-Agent mac dinh cua Electron co
// chua chu "Electron/..." nen cac trang dung Cloudflare (claude.ai, chatgpt.com)
// rat hay chan o buoc xac thuc bot. Bo chu Electron di giup qua duoc nhieu
// truong hop hon, nhung khong dam bao 100% vi Cloudflare con kiem tra dau van
// tay trinh duyet khac.
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function getOrCreateView(bot) {
  if (views.has(bot.id)) return views.get(bot.id);
  const ses = session.fromPartition(`persist:council-${bot.id}`);
  ses.setUserAgent(CHROME_UA);
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  view.webContents.setUserAgent(CHROME_UA);
  view.webContents.loadURL(bot.url);
  views.set(bot.id, view);
  return view;
}

function hideAllViews() {
  if (!win) return;
  for (const view of views.values()) {
    try { win.contentView.removeChildView(view); } catch (_) { /* chua gan */ }
  }
}

function layoutViews({ mode, activeId, rect }) {
  if (!win || !rect || rect.width < 10 || rect.height < 10) { hideAllViews(); return; }
  const x = Math.round(rect.x), y = Math.round(rect.y);
  const w = Math.round(rect.width), h = Math.round(rect.height);
  if (mode === 'grid') {
    const gap = 6;
    const cw = Math.floor((w - gap) / 2), ch = Math.floor((h - gap) / 2);
    BOTS.forEach((bot, i) => {
      const view = getOrCreateView(bot);
      try { win.contentView.addChildView(view); } catch (_) { /* da gan */ }
      const col = i % 2, row = Math.floor(i / 2);
      view.setBounds({ x: x + col * (cw + gap), y: y + row * (ch + gap), width: cw, height: ch });
    });
  } else {
    // Che do tab: chi view cua bot dang chon duoc hien, cac view con lai an.
    BOTS.forEach((bot) => {
      const view = getOrCreateView(bot);
      if (bot.id === activeId) {
        try { win.contentView.addChildView(view); } catch (_) { /* da gan */ }
        view.setBounds({ x, y, width: w, height: h });
      } else {
        try { win.contentView.removeChildView(view); } catch (_) { /* chua gan */ }
      }
    });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    title: 'Chat Hội Đồng',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  win.on('closed', () => { win = null; views.clear(); });
}

// ---- IPC: renderer <-> main ----
ipcMain.handle('views:layout', (_e, payload) => { layoutViews(payload || {}); return true; });
ipcMain.handle('views:hide', () => { hideAllViews(); return true; });
ipcMain.handle('views:reload', (_e, botId) => {
  const bot = BOTS.find((b) => b.id === botId);
  if (bot) getOrCreateView(bot).webContents.reload();
  return true;
});
ipcMain.handle('views:new-session', (_e, botId) => {
  // "Session moi" cho 1 vong = nap lai trang goc cua chatbot; nguoi dung tu
  // bam New chat trong trang. App khong tu dong thao tac trong trang.
  const bot = BOTS.find((b) => b.id === botId);
  if (bot) getOrCreateView(bot).webContents.loadURL(bot.url);
  return true;
});
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text ?? '')); return true; });
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('file:save-text', async (_e, { filename, content }) => {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: filename || 'ket-qua-hoi-dong.md',
    filters: [{ name: 'Markdown / Text', extensions: ['md', 'txt'] }],
  });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, String(content ?? ''), 'utf8');
  return { saved: true, path: result.filePath };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
