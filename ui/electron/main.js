// Electron main process — Chat Hoi Dong UI
// Nhiem vu: 1 cua so duy nhat, ben trong chua cac WebContentsView (1 cho moi
// chatbot, cong tab Muse cho buoc tong hop cuoi). Moi view co partition rieng (persist:council-<id>) nen dang nhap
// duoc luu tren dia, tat app mo lai van con. App chi mo/an cac view va xu ly
// clipboard + luu file; viec dan prompt, bam Gui, copy dap an van do nguoi
// dung lam tay trong tung trang chatbot (ban tu dong, dung chinh sach).
const { app, BrowserWindow, WebContentsView, ipcMain, clipboard, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { createFsApi } = require('./fsApi');
const { createGeminiApi } = require('./geminiApi');
const { extractFromView, scanCandidatesInView, startPickInView, pollPickInView, fillComposerInView } = require('./answerExtract');

const BOTS = [
  { id: 'chatgpt', url: 'https://chatgpt.com/' },
  { id: 'claude', url: 'https://claude.ai/' },
  { id: 'gemini', url: 'https://gemini.google.com/app' },
  { id: 'copilot', url: 'https://copilot.microsoft.com/' },
];

// Muse la tab rieng cho BUOC TONG HOP CUOI CUNG (sau vong 3), khong phai
// thanh vien tranh luan thu 5: chi hien o che do tab, khong vao luoi 2x2 cua
// 4 thanh vien. Tab nay mo muse.ai — nguoi dung dang nhap bang tai khoan Muse
// cua chinh minh (1 lan, partition persist:council-muse nho lai nhu cac bot).
const SYNTH_VIEW = { id: 'muse', url: 'https://muse.ai/' };
const VIEWS = [...BOTS, SYNTH_VIEW];

let win = null;
const views = new Map(); // id -> WebContentsView

// Khai bao nhu Chrome that tren Windows: User-Agent mac dinh cua Electron co
// chua chu "Electron/..." nen cac trang dung Cloudflare (claude.ai, chatgpt.com)
// rat hay chan o buoc xac thuc bot. Bo chu Electron di giup qua duoc nhieu
// truong hop hon, nhung khong dam bao 100% vi Cloudflare con kiem tra dau van
// tay trinh duyet khac.
// Phien ban Chrome trong UA PHAI khop voi Chromium that dang chay (Cloudflare
// so sanh UA voi header sec-ch-ua va navigator.userAgentData; lech la bi chan).
const CHROME_MAJOR = String(process.versions.chrome || '').split('.')[0] || '156';
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;

// Ap UA cho moi noi (ke ca iframe xac minh challenges.cloudflare.com, service
// worker) va tat dau hieu tu dong hoa (navigator.webdriver).
app.userAgentFallback = CHROME_UA;
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

const AUTH_HOSTS = /(^|\.)(accounts\.google\.com|google\.com|login\.microsoftonline\.com|login\.live\.com|microsoft\.com|appleid\.apple\.com|apple\.com|auth0\.com|openai\.com|chatgpt\.com|claude\.ai|anthropic\.com|muse\.ai|meta\.ai|facebook\.com|accountscenter\.facebook\.com|accountscenter\.meta\.com)$/i;
function safeHost(u) { try { return new URL(u).hostname; } catch (_) { return ''; } }

function getOrCreateView(bot) {
  if (views.has(bot.id)) return views.get(bot.id);
  const ses = session.fromPartition(`persist:council-${bot.id}`);
  ses.setUserAgent(CHROME_UA);
  // Google tu choi dang nhap tu trinh duyet nhung (hien "This browser or app
  // may not be secure"). Rieng accounts.google.com, bo cac header client-hint
  // de lo dau hieu Electron di.
  ses.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*'] }, (details, cb) => {
    const h = details.requestHeaders;
    h['User-Agent'] = CHROME_UA;
    for (const k of Object.keys(h)) if (/^sec-ch-ua/i.test(k)) delete h[k];
    cb({ requestHeaders: h });
  });
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  view.webContents.setUserAgent(CHROME_UA);

  // Dang nhap bang Google/Microsoft/Apple thuong mo popup (window.open) va
  // popup nay can dung CHUNG session de cookie dang nhap quay ve trang chinh.
  // Cac link thuong (khong phai popup dang nhap) mo bang trinh duyet he thong.
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (AUTH_HOSTS.test(safeHost(url))) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });
  view.webContents.on('did-create-window', (child) => child.webContents.setUserAgent(CHROME_UA));

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
    // Luoi chi danh cho 4 thanh vien tranh luan; tab Muse (tong hop) an o che
    // do nay — can tong hop thi chuyen ve che do "1 tab" va chon the Muse.
    if (views.has(SYNTH_VIEW.id)) { try { win.contentView.removeChildView(views.get(SYNTH_VIEW.id)); } catch (_) { /* chua gan */ } }
    const gap = 6;
    const cw = Math.floor((w - gap) / 2), ch = Math.floor((h - gap) / 2);
    BOTS.forEach((bot, i) => {
      const view = getOrCreateView(bot);
      try { win.contentView.addChildView(view); } catch (_) { /* da gan */ }
      const col = i % 2, row = Math.floor(i / 2);
      view.setBounds({ x: x + col * (cw + gap), y: y + row * (ch + gap), width: cw, height: ch });
    });
  } else {
    // Che do tab: chi view dang chon duoc hien (ke ca tab Muse tong hop),
    // cac view con lai an.
    VIEWS.forEach((bot) => {
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
// Lay dap an cuoi cung cua chatbot ngay trong tab cua no (nut 1 cham o the
// bot) — chi doc khi nguoi dung bam nut, ket qua ve o nhap de duyet roi moi
// luu. Xem electron/answerExtract.js.
ipcMain.handle('views:extract-answer', async (_e, botId, customSelector, opts) => {
  const view = views.get(botId);
  if (!view) return { ok: false, error: 'Tab này chưa được mở trong app — hãy bấm vào thẻ của bot để mở tab trước, đợi bot trả lời xong rồi bấm lại.' };
  return extractFromView(view, botId, customSelector, opts || {});
});
// Quet cac vung noi dung ung vien ngay trong trang that (cho panel cai dat
// lay dap an): nguoi dung xem truoc noi dung tung vung roi chon 1 vung lam
// selector cua bot do, thay cho selector mac dinh.
ipcMain.handle('views:scan-candidates', async (_e, botId) => {
  const view = views.get(botId);
  if (!view) return { ok: false, error: 'Tab này chưa được mở trong app — hãy bấm vào thẻ của bot để mở tab trước rồi bấm lại.' };
  return scanCandidatesInView(view);
});
// Che do chon vung truc tiep: bat pick trong trang, renderer hoi ket qua
// bang poll cho den khi nguoi dung bam vao 1 khoi (hoac ESC huy).
ipcMain.handle('views:start-pick', async (_e, botId) => {
  const view = views.get(botId);
  if (!view) return { ok: false, error: 'Tab này chưa được mở trong app.' };
  return startPickInView(view);
});
ipcMain.handle('views:poll-pick', async (_e, botId) => {
  const view = views.get(botId);
  if (!view) return { done: true, ok: false, error: 'Tab này chưa được mở.' };
  return pollPickInView(view);
});
// Dan prompt thang vao o nhap cua chatbot trong tab (nguoi dung doc lai
// trong trang roi TU bam Gui — app khong bam Gui ho).
ipcMain.handle('views:fill-composer', async (_e, botId, text) => {
  const view = views.get(botId);
  if (!view) return { ok: false, error: 'Tab này chưa được mở trong app — hãy bấm vào thẻ của bot để mở tab trước rồi bấm lại.' };
  return fillComposerInView(view, botId, text);
});
ipcMain.handle('views:reload', (_e, botId) => {
  const bot = VIEWS.find((b) => b.id === botId);
  if (bot) getOrCreateView(bot).webContents.reload();
  return true;
});
ipcMain.handle('views:new-session', (_e, botId) => {
  // "Session moi" cho 1 vong = nap lai trang goc cua chatbot; nguoi dung tu
  // bam New chat trong trang. App khong tu dong thao tac trong trang.
  const bot = VIEWS.find((b) => b.id === botId);
  if (bot) getOrCreateView(bot).webContents.loadURL(bot.url);
  return true;
});
// ---- Cua so SO SANH DAP AN (ban lam lai UI): BrowserWindow RIENG tai cung
// renderer voi ?compare=1, doc du lieu tu localStorage do App chinh ghi.
// Khong an WebContentsView, khong de len vung trang web nhung.
let compareWin = null;
ipcMain.handle('compare:open', () => {
  if (compareWin && !compareWin.isDestroyed()) { compareWin.focus(); return true; }
  compareWin = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    title: 'So sánh đáp án — Hội Đồng',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const isDev = process.argv.includes('--dev');
  if (isDev) {
    compareWin.loadURL('http://localhost:5173/?compare=1');
  } else {
    compareWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { compare: '1' } });
  }
  compareWin.on('closed', () => { compareWin = null; });
  return true;
});
ipcMain.handle('compare:set-on-top', (_e, flag) => {
  if (compareWin && !compareWin.isDestroyed()) compareWin.setAlwaysOnTop(!!flag);
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

// ---- IPC lam viec voi file he thong (goi day du: chon thu muc lam viec,
// tao thu muc phien giu nguyen 3 vong, ghi file tung dap an, doc file ngu
// canh, keo-tha, lich su phien/file, mo Explorer, xoa vao Recycle Bin,
// fs.watch bao tien trinh) — xem electron/fsApi.js. Renderer chi goi qua
// window.councilFs o preload, khong cham truc tiep vao o dia.
createFsApi({ app, getWindow: () => win });

// ---- IPC Gemini API (dieu phoi): tom tat the luan diem, kiem tra form,
// goi tom tat truoc tong hop — xem electron/geminiApi.js. API key do renderer
// gui theo tung lan goi, main khong luu key.
createGeminiApi();

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
