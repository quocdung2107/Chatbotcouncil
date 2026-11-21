import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BOTS, SYNTH_BOT, sessionFileName, SYNTH_FILE_NAME } from '../lib/council';
import {
  chooseWorkDirRequested, loadContextRequested, restoreSessionRequested,
  openSessionRequested,
  refreshFilesRequested, contextLoaded, contextCleared, recentFilesUpdated,
  historyUpdated, logAdded,
} from '../store/councilSlice';
import Badge from './Badge';

// Panel "File & tien trinh": thu muc lam viec, file ngu canh, bang tien trinh
// 4 bot x 3 vong tinh THEO FILE that trong thu muc phien (moi dap an = 1 file),
// danh sach file cua phien, file gan day va lich su cac phien cu.
// Chi ban Electron moi co window.councilFs; che do trinh duyet chi hien ghi chu.
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour12: false });
}
function fmtSize(bytes) {
  if (bytes == null) return '';
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

export default function FilesPanel() {
  const dispatch = useDispatch();
  const files = useSelector((s) => s.council.files);
  const fsx = typeof window !== 'undefined' ? window.councilFs : undefined;
  const isElectron = !!fsx;

  const byName = Object.fromEntries((files.sessionFiles || []).map((f) => [f.name, f]));

  const openPath = (p) => { if (fsx?.openPath) fsx.openPath(p); };
  const showInFolder = (p) => { if (fsx?.showInFolder) fsx.showInFolder(p); };

  const trashFile = async (f) => {
    if (!window.confirm(`Đưa file "${f.name}" vào Recycle Bin? (khôi phục lại được từ thùng rác)`)) return;
    const result = await fsx.trash(f.path);
    if (result?.ok) {
      if (result.recentFiles) dispatch(recentFilesUpdated(result.recentFiles));
      if (result.history) dispatch(historyUpdated(result.history));
      dispatch(refreshFilesRequested());
      dispatch(logAdded(`Đã đưa file ${f.name} vào Recycle Bin.`));
    } else {
      dispatch(logAdded(`Không xoá được file: ${result?.error || 'lỗi không rõ'}`));
    }
  };

  const loadRecentAsContext = async (entry) => {
    if (!fsx?.readPath) return;
    const result = await fsx.readPath(entry.path);
    if (result?.ok) {
      dispatch(contextLoaded({ name: result.name, path: result.path, text: result.content }));
      if (result.recentFiles) dispatch(recentFilesUpdated(result.recentFiles));
    } else {
      dispatch(logAdded(`Không đọc lại được file "${entry.name}": ${result?.error || 'file đã bị di chuyển/xoá'}`));
    }
  };

  if (!isElectron) {
    return (
      <div className="files-panel">
        <div className="sidebar-title">📁 File &amp; tiến trình</div>
        <p className="files-note">
          Bạn đang ở chế độ trình duyệt: kéo-thả file .txt/.md/.json vào cửa sổ này vẫn nạp được ngữ cảnh,
          nhưng thư mục phiên, lịch sử file và mở Explorer chỉ có ở bản app Electron (<code>npm run dev</code>).
        </p>
        {files.contextName && (
          <div className="files-row">
            <span className="files-path" title={files.contextPath}>Ngữ cảnh: {files.contextName} ({files.contextText.length} ký tự)</span>
            <button type="button" onClick={() => dispatch(contextCleared())}>Bỏ</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="files-panel">
      <div className="sidebar-title">📁 File &amp; tiến trình (giữ nguyên 3 vòng)</div>

      <div className="files-row">
        <span className="files-label">Thư mục làm việc:</span>
        <button type="button" onClick={() => dispatch(chooseWorkDirRequested())}>Đổi…</button>
        <button type="button" disabled={!files.workDir} onClick={() => openPath(files.workDir)}>Mở Explorer</button>
        <button type="button" onClick={() => dispatch(openSessionRequested())}>Mở phiên (.json)…</button>
      </div>
      <div className="files-path" title={files.workDir}>{files.workDir || '(đang tải…)'}</div>

      {files.sessionDir ? (
        <>
          <div className="files-row">
            <span className="files-label">Thư mục phiên này:</span>
            <button type="button" onClick={() => openPath(files.sessionDir)}>Mở Explorer</button>
            <button type="button" onClick={() => dispatch(refreshFilesRequested())}>↻ Làm mới</button>
          </div>
          <div className="files-path" title={files.sessionDir}>{files.sessionDir}</div>

          <table className="progress-matrix">
            <thead>
              <tr><th>Bot</th><th>Vòng 1</th><th>Vòng 2</th><th>Vòng 3</th></tr>
            </thead>
            <tbody>
              {BOTS.map((bot) => (
                <tr key={bot.id}>
                  <td className="pm-bot">{bot.name}</td>
                  {[1, 2, 3].map((r) => {
                    const f = byName[sessionFileName(bot.id, r)];
                    return (
                      <td key={r} className={f ? 'pm-done' : 'pm-todo'}>
                        {f ? (
                          <button type="button" className="pm-cell" title={`${f.name} — ${fmtSize(f.size)}${f.lines ? `, ${f.lines} dòng` : ''} — ghi lúc ${fmtTime(f.mtime)}. Bấm để mở file.`} onClick={() => openPath(f.path)}>
                            <Badge status="SAVED" /> {new Date(f.mtime).toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                          </button>
                        ) : <Badge status="NOT_READY" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="pm-bot">{SYNTH_BOT.name}</td>
                <td colSpan={3} className={byName[SYNTH_FILE_NAME] ? 'pm-done' : 'pm-todo'}>
                  {byName[SYNTH_FILE_NAME] ? <><Badge status="SAVED" /> Đã ghi {SYNTH_FILE_NAME} lúc {fmtTime(byName[SYNTH_FILE_NAME].mtime)}</> : <><Badge status="NOT_READY" /> Chưa có kết luận tổng hợp</>}
                </td>
              </tr>
            </tbody>
          </table>

          <details className="files-details">
            <summary>File trong thư mục phiên ({files.sessionFiles.length})</summary>
            {files.sessionFiles.map((f) => (
              <div key={f.path} className="file-item">
                <span className="file-name" title={f.path}>{f.name}</span>
                <span className="file-meta">{fmtSize(f.size)}{f.lines ? ` · ${f.lines} dòng` : ''} · {fmtTime(f.mtime)}</span>
                <button type="button" onClick={() => openPath(f.path)}>Mở</button>
                <button type="button" onClick={() => showInFolder(f.path)}>Explorer</button>
                <button type="button" onClick={() => trashFile(f)}>Xoá</button>
              </div>
            ))}
            <div className="files-note">Lịch sử đầy đủ của phiên nằm trong file <code>tien-trinh.md</code> và <code>logs/activity.jsonl</code> trong thư mục phiên.</div>
          </details>
        </>
      ) : (
        <p className="files-note">Bắt đầu 1 chủ đề, app sẽ tự tạo thư mục phiên <code>HoiDong/&lt;tên-chủ-đề&gt;/</code> với thư mục riêng cho từng bot (01-chatgpt, 02-claude, 03-gemini, 04-copilot, 05-muse), kèm file yêu cầu và file hướng dẫn chung.</p>
      )}

      <div className="files-row">
        <span className="files-label">File ngữ cảnh:</span>
        <button type="button" onClick={() => dispatch(loadContextRequested())}>Nạp file…</button>
        {files.contextName && <button type="button" onClick={() => dispatch(contextCleared())}>Bỏ</button>}
      </div>
      {files.contextName
        ? <div className="files-path" title={files.contextPath}>{files.contextName} — {files.contextText.length} ký tự, sẽ đính vào prompt vòng 1 + tổng hợp. Cũng có thể kéo-thả file thẳng vào cửa sổ app.</div>
        : <div className="files-note">Nạp hoặc kéo-thả file .txt/.md/.json để bot có thêm ngữ cảnh mà không cần copy-paste.</div>}

      {files.recentFiles.length > 0 && (
        <details className="files-details">
          <summary>File gần đây ({files.recentFiles.length})</summary>
          {files.recentFiles.map((entry) => (
            <div key={entry.path} className="file-item">
              <span className="file-name" title={entry.path}>{entry.name}</span>
              <span className="file-meta">{fmtTime(entry.at)}</span>
              {(entry.kind === 'context' || entry.kind === 'dropped')
                ? <button type="button" onClick={() => loadRecentAsContext(entry)}>Nạp làm ngữ cảnh</button>
                : <button type="button" onClick={() => showInFolder(entry.path)}>Explorer</button>}
            </div>
          ))}
        </details>
      )}

      {(files.history.length > 0 || files.recentSessions.length > 0) && (
        <details className="files-details">
          <summary>Lịch sử phiên hội đồng ({(files.history.length || files.recentSessions.length)})</summary>
          {(files.history.length ? files.history : files.recentSessions).map((h) => (
            <div key={h.dir} className="file-item">
              <span className="file-name" title={h.dir}>{h.title}</span>
              <span className="file-meta">{h.savedCount}/12 đáp án{h.hasSynthesis ? ' · có tổng hợp' : ''} · {fmtTime(h.updatedAt)}</span>
              <button type="button" onClick={() => dispatch(restoreSessionRequested(h.dir))}>Mở lại</button>
              <button type="button" onClick={() => openPath(h.dir)}>Explorer</button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
