// fsApi.js — phan lam viec voi FILE HE THONG Windows cho app Hoi Dong.
// Chi chay o Electron MAIN process (Node.js). Renderer (React) khong cham
// truc tiep vao o dia; moi thao tac di qua IPC + preload (window.councilFs).
//
// Nguyen tac an toan:
// - Ghi / xoa / mo file: chi trong THU MUC LAM VIEC nguoi dung da chon
//   (workDir) — khong ghi tuy tien ra ngoai.
// - Doc file ngoai workDir: chi khi nguoi dung tu chon qua hop thoai mo file
//   hoac keo-tha file vao app (duong dan do chinh thao tac cua nguoi dung
//   cung cap). Cac WebContentsView cua chatbot KHONG co preload nay nen
//   khong goi duoc cac ham o day.
// - Xoa file = dua vao Recycle Bin (shell.trashItem), khong xoa cung.
// - Moi lan ghi file vao thu muc phien: tu ghi them 1 dong vao
//   tien-trinh.md + logs/activity.jsonl cua phien do.
const { ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.csv', '.log']);
const MAX_READ_BYTES = 2 * 1024 * 1024; // 2MB — file ngu canh la van ban, khong phai media

function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

function safeBaseName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base !== String(name || '').replace(/[\\/]+$/, '') && base.includes('..')) return null;
  if (/[<>:"|?*\x00-\x1f]/.test(base)) return null;
  return base;
}

function createFsApi({ app, getWindow }) {
  const settingsPath = path.join(app.getPath('userData'), 'council-settings.json');
  let settings = { workDir: '', recentFiles: [] };
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') settings = { workDir: parsed.workDir || '', recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : [] };
  } catch (_) { /* chua co file cai dat — dung mac dinh */ }

  function saveSettings() {
    try { fs.mkdirSync(path.dirname(settingsPath), { recursive: true }); fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8'); } catch (_) { /* bo qua */ }
  }

  function defaultWorkDir() {
    return path.join(app.getPath('documents'), 'ChatHoiDong');
  }

  function workDir() {
    return settings.workDir || defaultWorkDir();
  }

  function addRecent(entry) {
    settings.recentFiles = [entry, ...settings.recentFiles.filter((r) => r.path !== entry.path)].slice(0, 20);
    saveSettings();
  }

  // ---- Theo doi thu muc phien (fs.watch) de panel tien trinh tu cap nhat ----
  let watcher = null;
  let watchDir = null;
  let watchTimer = null;
  function stopWatch() { if (watcher) { try { watcher.close(); } catch (_) {} watcher = null; watchDir = null; } }
  function startWatch(dir) {
    if (!dir || !isInside(workDir(), dir)) return;
    if (watcher && watchDir === dir) return;
    stopWatch();
    try {
      watcher = fs.watch(dir, { recursive: false }, () => {
        clearTimeout(watchTimer);
        watchTimer = setTimeout(() => {
          const win = getWindow();
          if (win && !win.isDestroyed()) win.webContents.send('fs:changed', { dir });
        }, 250);
      });
      watchDir = dir;
    } catch (_) { /* thu muc chua ton tai — bo qua */ }
  }

  function appendActivity(sessionDir, text) {
    if (!sessionDir || !isInside(workDir(), sessionDir)) return;
    const stamp = new Date().toISOString();
    const line = `- ${stamp} — ${text}`;
    try {
      fs.mkdirSync(path.join(sessionDir, 'logs'), { recursive: true });
      fs.appendFileSync(path.join(sessionDir, 'tien-trinh.md'), line + '\n', 'utf8');
      fs.appendFileSync(path.join(sessionDir, 'logs', 'activity.jsonl'), JSON.stringify({ time: stamp, text }) + '\n', 'utf8');
    } catch (_) { /* bo qua */ }
  }

  function listSessionFiles(sessionDir) {
    if (!sessionDir || !isInside(workDir(), sessionDir) || !fs.existsSync(sessionDir)) return [];
    const out = [];
    for (const name of fs.readdirSync(sessionDir)) {
      const full = path.join(sessionDir, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        let lines = null;
        if (TEXT_EXTS.has(path.extname(name).toLowerCase()) && st.size <= MAX_READ_BYTES) {
          lines = fs.readFileSync(full, 'utf8').split('\n').length;
        }
        out.push({ name, path: full, size: st.size, mtime: st.mtime.toISOString(), lines });
      } catch (_) { /* bo qua file loi */ }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  function scanHistory() {
    const root = workDir();
    if (!fs.existsSync(root)) return [];
    const sessions = [];
    for (const name of fs.readdirSync(root)) {
      const dir = path.join(root, name);
      try {
        if (!fs.statSync(dir).isDirectory()) continue;
        const metaPath = path.join(dir, 'phien.json');
        let meta = null;
        if (fs.existsSync(metaPath)) { try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (_) { meta = null; } }
        const files = listSessionFiles(dir);
        const answerFiles = files.filter((f) => /-vong-[123]\.md$/.test(f.name));
        sessions.push({
          dir, folder: name,
          title: meta?.topic?.title || name,
          phase: meta?.phase || '',
          savedCount: answerFiles.length,
          hasSynthesis: files.some((f) => f.name === 'muse-tong-hop.md'),
          updatedAt: meta?.updatedAt || (files.length ? files.map((f) => f.mtime).sort().slice(-1)[0] : null),
          fileCount: files.length,
        });
      } catch (_) { /* bo qua */ }
    }
    return sessions.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 30);
  }

  function readTextFileGuarded(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!TEXT_EXTS.has(ext)) return { ok: false, error: `Chỉ đọc được file văn bản: ${[...TEXT_EXTS].join(', ')}` };
    const st = fs.statSync(filePath);
    if (st.size > MAX_READ_BYTES) return { ok: false, error: 'File lớn hơn 2MB — hãy cắt bớt rồi thử lại.' };
    return { ok: true, content: fs.readFileSync(filePath, 'utf8') };
  }

  // ================= IPC =================
  ipcMain.handle('fs:get-state', () => ({
    workDir: workDir(),
    isDefaultWorkDir: !settings.workDir,
    recentFiles: settings.recentFiles,
    history: scanHistory(),
  }));

  ipcMain.handle('fs:choose-workdir', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: workDir() });
    if (result.canceled || !result.filePaths[0]) return { ok: false };
    settings.workDir = result.filePaths[0];
    fs.mkdirSync(settings.workDir, { recursive: true });
    saveSettings();
    return { ok: true, workDir: settings.workDir, history: scanHistory() };
  });

  ipcMain.handle('fs:ensure-session', (_e, { folderName, files }) => {
    if (!/^[a-zA-Z0-9-_]+$/.test(folderName || '')) return { ok: false, error: 'Tên thư mục phiên không hợp lệ.' };
    const dir = path.join(workDir(), folderName);
    fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
    // Chi ghi cac file khoi tao khi CHUA ton tai (khong ghi de phien dang lam).
    for (const f of files || []) {
      const base = safeBaseName(f.name);
      if (!base) continue;
      const full = path.join(dir, base);
      if (!fs.existsSync(full)) fs.writeFileSync(full, String(f.content ?? ''), 'utf8');
    }
    appendActivity(dir, `Tạo / mở thư mục phiên: ${folderName}`);
    startWatch(dir);
    return { ok: true, sessionDir: dir, files: listSessionFiles(dir) };
  });

  ipcMain.handle('fs:write-session-file', (_e, { sessionDir, name, content, activity }) => {
    const base = safeBaseName(name);
    if (!base || !sessionDir || !isInside(workDir(), sessionDir)) return { ok: false, error: 'Đường dẫn không hợp lệ.' };
    fs.mkdirSync(sessionDir, { recursive: true });
    const full = path.join(sessionDir, base);
    fs.writeFileSync(full, String(content ?? ''), 'utf8');
    if (activity) appendActivity(sessionDir, activity);
    addRecent({ path: full, name: base, kind: 'session-file', at: new Date().toISOString() });
    return { ok: true, path: full, files: listSessionFiles(sessionDir), recentFiles: settings.recentFiles };
  });

  ipcMain.handle('fs:append-activity', (_e, { sessionDir, text }) => {
    appendActivity(sessionDir, String(text || ''));
    return { ok: true, files: sessionDir ? listSessionFiles(sessionDir) : [] };
  });

  ipcMain.handle('fs:list-session-files', (_e, { sessionDir }) => ({ ok: true, files: listSessionFiles(sessionDir || '') }));

  ipcMain.handle('fs:read-session-json', (_e, { sessionDir }) => {
    if (!sessionDir || !isInside(workDir(), sessionDir)) return { ok: false };
    const metaPath = path.join(sessionDir, 'phien.json');
    if (!fs.existsSync(metaPath)) return { ok: false, error: 'Thư mục này chưa có file phien.json.' };
    try { return { ok: true, data: JSON.parse(fs.readFileSync(metaPath, 'utf8')) }; } catch (err) { return { ok: false, error: String(err) }; }
  });

  ipcMain.handle('fs:open-context-dialog', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'File văn bản làm ngữ cảnh', extensions: ['txt', 'md', 'json', 'csv'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
    const filePath = result.filePaths[0];
    const read = readTextFileGuarded(filePath);
    if (!read.ok) return read;
    addRecent({ path: filePath, name: path.basename(filePath), kind: 'context', at: new Date().toISOString() });
    return { ok: true, path: filePath, name: path.basename(filePath), content: read.content, recentFiles: settings.recentFiles };
  });

  // Doc file nguoi dung keo-tha vao app (duong dan lay qua webUtils o preload).
  ipcMain.handle('fs:read-path', (_e, { filePath }) => {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'Không tìm thấy file.' };
    const read = readTextFileGuarded(filePath);
    if (!read.ok) return read;
    addRecent({ path: filePath, name: path.basename(filePath), kind: 'dropped', at: new Date().toISOString() });
    return { ok: true, path: filePath, name: path.basename(filePath), content: read.content, recentFiles: settings.recentFiles };
  });

  ipcMain.handle('fs:open-path', async (_e, { targetPath }) => {
    if (!targetPath || !isInside(workDir(), targetPath)) return { ok: false };
    const err = await shell.openPath(targetPath);
    return { ok: !err, error: err || undefined };
  });

  ipcMain.handle('fs:show-in-folder', (_e, { targetPath }) => {
    if (!targetPath) return { ok: false };
    shell.showItemInFolder(targetPath);
    return { ok: true };
  });

  ipcMain.handle('fs:trash', async (_e, { targetPath }) => {
    if (!targetPath || !isInside(workDir(), targetPath)) return { ok: false, error: 'Chỉ xoá được file trong thư mục làm việc.' };
    await shell.trashItem(targetPath);
    settings.recentFiles = settings.recentFiles.filter((r) => r.path !== targetPath);
    saveSettings();
    return { ok: true, recentFiles: settings.recentFiles, history: scanHistory() };
  });

  ipcMain.handle('fs:watch-session', (_e, { sessionDir }) => { startWatch(sessionDir || ''); return { ok: true }; });

  return { appendActivity };
}

module.exports = { createFsApi, isInside };
