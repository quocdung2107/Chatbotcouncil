import { all, call, put, select, takeEvery } from 'redux-saga/effects';
import {
  buildPrompt, buildSynthesisPrompt, buildExportMarkdown,
  buildBriefingText, buildRequestText, sessionFolderName, sessionFileName,
  SYNTH_FILE_NAME, SESSION_JSON_NAME, BOT_BY_ID,
} from '../lib/council';
import {
  copyPromptRequested, pasteAnswerRequested, exportRequested,
  copySynthesisPromptRequested, pasteSynthesisAnswerRequested,
  filesInitRequested, chooseWorkDirRequested, loadContextRequested,
  restoreSessionRequested, openSessionRequested, dropAnswerFileRequested,
  refreshFilesRequested,
  promptCopied, answerPasted, saveAnswer, nextRound, finishSession,
  synthesisPromptCopied, synthesisAnswerPasted, synthesisSaved,
  startSession,
  exportDone, logAdded, selectCouncil, selectRoundComplete,
  filesStateLoaded, workDirChanged, sessionFolderReady, sessionFilesUpdated,
  recentFilesUpdated, historyUpdated, contextLoaded, sessionRestored,
} from './councilSlice';

// Cau noi Electron (preload). Khi chay bang trinh duyet de dev giao dien,
// window.councilApi / window.councilFs khong ton tai — saga tu roi ve
// navigator.clipboard va tai file bang trinh duyet, tinh nang file he thong
// (thu muc phien, lich su) chi co o ban Electron.
function getApi() {
  return typeof window !== 'undefined' ? window.councilApi : undefined;
}
function getFs() {
  return typeof window !== 'undefined' ? window.councilFs : undefined;
}

function* clipboardWrite(text) {
  const api = getApi();
  if (api?.clipboardWrite) yield call(api.clipboardWrite, text);
  else if (navigator?.clipboard?.writeText) yield call([navigator.clipboard, navigator.clipboard.writeText], text);
}

function* clipboardRead() {
  const api = getApi();
  if (api?.clipboardRead) return yield call(api.clipboardRead);
  if (navigator?.clipboard?.readText) return yield call([navigator.clipboard, navigator.clipboard.readText]);
  return '';
}

// Snapshot toan bo phien -> noi dung file phien.json (de mo lai phien cu).
function snapshotOf(state) {
  return {
    topic: state.topic,
    phase: state.phase,
    round: state.round,
    answers: state.answers,
    synthesis: state.synthesis,
    files: {
      sessionDir: state.files.sessionDir,
      sessionFolder: state.files.sessionFolder,
      contextName: state.files.contextName,
      contextText: state.files.contextText,
    },
    updatedAt: new Date().toISOString(),
  };
}

// Ghi 1 file vao thu muc phien (neu dang chay Electron va phien da co thu muc).
// Tra ve true neu ghi duoc. Loi ghi file khong duoc lam hong luong chinh.
function* writeSessionFile(name, content, activity) {
  const fsx = getFs();
  const state = yield select(selectCouncil);
  if (!fsx?.writeSessionFile || !state.files.sessionDir) return false;
  try {
    const result = yield call(fsx.writeSessionFile, state.files.sessionDir, name, content, activity);
    if (result?.ok) {
      if (result.files) yield put(sessionFilesUpdated(result.files));
      if (result.recentFiles) yield put(recentFilesUpdated(result.recentFiles));
      return true;
    }
  } catch (_) { /* bo qua — dap an van con trong app + localStorage */ }
  return false;
}

function* writeSnapshot() {
  const state = yield select(selectCouncil);
  yield call(writeSessionFile, SESSION_JSON_NAME, JSON.stringify(snapshotOf(state), null, 2), undefined);
}

// 1) Copy prompt cua bot dang xet o vong hien tai vao clipboard
function* copyPromptSaga(action) {
  const botId = action.payload;
  const state = yield select(selectCouncil);
  const prompt = buildPrompt({ topic: state.topic, round: state.round, botId, answers: state.answers, contextText: state.files.contextText });
  yield call(clipboardWrite, prompt);
  yield put(promptCopied(botId));
}

// 2) Dan dap an tu clipboard ve dung o cua bot
function* pasteAnswerSaga(action) {
  const botId = action.payload;
  const text = yield call(clipboardRead);
  if (!text || !String(text).trim()) {
    yield put(logAdded('Clipboard đang trống — hãy copy đáp án trong trang chatbot trước rồi bấm lại nút dán.'));
    return;
  }
  yield put(answerPasted({ botId, answer: String(text) }));
}

// 3) Sau moi lan luu dap an: GHI FILE cua dap an do truoc (giu nguyen 3 vong —
// moi vong 1 file rieng), cap nhat phien.json, roi moi tu chuyen vong.
function* afterSaveSaga(action) {
  const botId = action.payload?.botId || action.payload;
  const stateBefore = yield select();
  const round = stateBefore.council.round;
  const cell = stateBefore.council.answers[round]?.[botId];
  if (cell?.answer?.trim()) {
    const botName = BOT_BY_ID[botId]?.name || botId;
    yield call(writeSessionFile, sessionFileName(botId, round), `# ${botName} — Vòng ${round}/3 — ${stateBefore.council.topic.title}\n\n${cell.answer}\n`, `Đã ghi đáp án vòng ${round} của ${botName} (${cell.answer.length} ký tự)`);
    yield call(writeSnapshot);
  }
  const state = yield select();
  if (state.council.phase !== 'running') return;
  if (!selectRoundComplete(state, state.council.round)) return;
  // Che do nhanh (opt-in): chi co vong 1 noi tiep — du 4/4 la sang tong hop
  // ngay, khong co vong 2/3. Mac dinh (deep) giu nguyen 3 vong.
  if (state.council.topic.mode === 'fast') { yield put(finishSession()); return; }
  if (state.council.round < 3) yield put(nextRound());
  else yield put(finishSession());
}

// 3b) Luu ket luan tong hop -> ghi file 05-muse/ket-luan-cuoi.md + ban xuat day du.
function* afterSynthesisSaga() {
  const state = yield select(selectCouncil);
  if (!state.synthesis.answer?.trim()) return;
  yield call(writeSessionFile, SYNTH_FILE_NAME, `# Kết luận tổng hợp cuối cùng — Muse — ${state.topic.title}\n\n${state.synthesis.answer}\n`, 'Đã ghi kết luận tổng hợp của Muse');
  yield call(writeSessionFile, 'ket-qua-hoi-dong.md', buildExportMarkdown(state), 'Đã ghi bản xuất toàn bộ phiên (ket-qua-hoi-dong.md)');
  yield call(writeSnapshot);
}

// 4) Xuat toan bo phien thanh file Markdown
function* exportSaga() {
  const state = yield select(selectCouncil);
  const markdown = buildExportMarkdown(state);
  const fsx = getFs();
  if (fsx?.writeSessionFile && state.files.sessionDir) {
    const ok = yield call(writeSessionFile, 'ket-qua-hoi-dong.md', markdown, 'Đã xuất toàn bộ kết quả phiên vào thư mục phiên');
    if (ok) {
      yield put(exportDone(`${state.files.sessionDir}\\ket-qua-hoi-dong.md`));
      const fresh = yield call(fsx.getState);
      if (fresh?.history) yield put(historyUpdated(fresh.history));
      return;
    }
  }
  const api = getApi();
  if (api?.saveTextFile) {
    const result = yield call(api.saveTextFile, 'ket-qua-hoi-dong.md', markdown);
    if (result?.saved) yield put(exportDone(result.path));
    else yield put(logAdded('Đã huỷ xuất file.'));
  } else if (typeof document !== 'undefined') {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ket-qua-hoi-dong.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    yield put(exportDone('ket-qua-hoi-dong.md (đã tải xuống bằng trình duyệt)'));
  } else {
    yield put(logAdded('Không xuất được file trong môi trường này.'));
  }
}

// 5) Copy prompt TONG HOP CUOI (tab Muse) — gom ban cuoi vong 3 + phan bien vong 2
// (che do nhanh: gom ban cuoi cua luot noi tiep vong 1).
function* copySynthesisPromptSaga() {
  const state = yield select(selectCouncil);
  const fullState = yield select();
  const lastRound = state.topic.mode === 'fast' ? 1 : 3;
  if (!selectRoundComplete(fullState, lastRound)) {
    yield put(logAdded(`Chưa đủ đáp án vòng ${lastRound} — Muse chỉ tổng hợp SAU khi cả 4 bot đã xong. Bạn có thể mở tab Muse trước để đăng nhập sẵn.`));
    return;
  }
  const prompt = buildSynthesisPrompt({ topic: state.topic, answers: state.answers, contextText: state.files.contextText });
  yield call(clipboardWrite, prompt);
  yield put(synthesisPromptCopied());
}

// 6) Dan ket luan tong hop tu tab Muse ve
function* pasteSynthesisAnswerSaga() {
  const text = yield call(clipboardRead);
  if (!text || !String(text).trim()) {
    yield put(logAdded('Clipboard đang trống — hãy copy kết luận trong tab Muse trước rồi bấm lại nút dán.'));
    return;
  }
  yield put(synthesisAnswerPasted(String(text)));
}

// ---- Workflow file ----

// 7) Khoi tao: lay thu muc lam viec + file gan day + lich su phien tu main;
// neu phien cu dang do (localStorage con sessionDir) thi xem lai thu muc do.
function* filesInitSaga() {
  const fsx = getFs();
  if (!fsx?.getState) return;
  try {
    const state = yield call(fsx.getState);
    yield put(filesStateLoaded(state));
    const council = yield select(selectCouncil);
    if (council.files.sessionDir) {
      yield call(fsx.watchSession, council.files.sessionDir);
      const listed = yield call(fsx.listSessionFiles, council.files.sessionDir);
      if (listed?.files) yield put(sessionFilesUpdated(listed.files));
    }
  } catch (_) { /* bo qua */ }
}

// 8) Bat dau phien: tao thu muc phien + file yeu cau + file huong dan chung.
function* ensureSessionSaga() {
  const fsx = getFs();
  if (!fsx?.ensureSession) return;
  const state = yield select(selectCouncil);
  if (state.files.sessionDir) { yield call(writeSnapshot); return; }
  const folder = sessionFolderName(state.topic.title);
  try {
    const result = yield call(fsx.ensureSession, folder, [
      { name: '00-yeu-cau.md', content: buildRequestText(state.topic, state.files.contextText) },
      { name: '00-huong-dan-chung.md', content: buildBriefingText(state.topic) },
      { name: 'tien-trinh.md', content: `# Tiến trình — ${state.topic.title}\n\n` },
    ]);
    if (result?.ok) {
      yield put(sessionFolderReady({ sessionDir: result.sessionDir, sessionFolder: folder, files: result.files }));
      yield call(writeSnapshot);
    } else if (result?.error) {
      yield put(logAdded(`Không tạo được thư mục phiên: ${result.error}`));
    }
  } catch (err) {
    yield put(logAdded(`Không tạo được thư mục phiên: ${String(err)}`));
  }
}

function* chooseWorkDirSaga() {
  const fsx = getFs();
  if (!fsx?.chooseWorkDir) return;
  const result = yield call(fsx.chooseWorkDir);
  if (result?.ok) yield put(workDirChanged({ workDir: result.workDir, history: result.history }));
}

function* loadContextSaga() {
  const fsx = getFs();
  if (!fsx?.openContextDialog) return;
  const result = yield call(fsx.openContextDialog);
  if (result?.ok) {
    yield put(contextLoaded({ name: result.name, path: result.path, text: result.content }));
    if (result.recentFiles) yield put(recentFilesUpdated(result.recentFiles));
    // Neu phien da co thu muc: cap nhat lai file yeu cau kem ngu canh moi.
    const state = yield select(selectCouncil);
    if (state.files.sessionDir) yield call(writeSessionFile, '00-yeu-cau.md', buildRequestText(state.topic, result.content), `Đã nạp file ngữ cảnh: ${result.name}`);
  } else if (result?.error) {
    yield put(logAdded(`Không đọc được file ngữ cảnh: ${result.error}`));
  }
}

function* restoreSessionSaga(action) {
  const fsx = getFs();
  const sessionDir = action.payload;
  if (!fsx?.readSessionJson || !sessionDir) return;
  const result = yield call(fsx.readSessionJson, sessionDir);
  if (!result?.ok) {
    yield put(logAdded(`Không mở lại được phiên: ${result?.error || 'thiếu file phien.json'}`));
    return;
  }
  const data = result.data;
  data.files = { ...(data.files || {}), sessionDir, sessionFolder: sessionDir.split(/[\\/]/).pop() };
  yield put(sessionRestored(data));
  yield call(fsx.watchSession, sessionDir);
  const listed = yield call(fsx.listSessionFiles, sessionDir);
  if (listed?.files) yield put(sessionFilesUpdated(listed.files));
}

// Mo phien cu bang hop thoai chon file (phien.json khoi phuc toan bo phien;
// file .md thi nap lam ngu canh de xem/dung lai noi dung do).
function* openSessionSaga() {
  const fsx = getFs();
  if (!fsx?.openSessionDialog) return;
  const result = yield call(fsx.openSessionDialog);
  if (!result?.ok) {
    if (result?.error) yield put(logAdded(`Không mở được file: ${result.error}`));
    return;
  }
  if (result.kind === 'session') {
    const data = result.data;
    data.files = { ...(data.files || {}), sessionDir: result.sessionDir, sessionFolder: result.sessionDir.split(/[\\/]/).pop() };
    yield put(sessionRestored(data));
    yield call(fsx.watchSession, result.sessionDir);
    const listed = yield call(fsx.listSessionFiles, result.sessionDir);
    if (listed?.files) yield put(sessionFilesUpdated(listed.files));
  } else if (result.kind === 'markdown') {
    yield put(contextLoaded({ name: result.name, path: result.path, text: result.content }));
    if (result.recentFiles) yield put(recentFilesUpdated(result.recentFiles));
  }
}

// Tha file len THE BOT: noi dung file tro thanh dap an cua bot do o vong
// hien tai (ghi thang vao thu muc cua bot: 01-chatgpt/vong-N.md...). Tha
// len the Muse thi tro thanh ket luan tong hop.
function* dropAnswerFileSaga(action) {
  const { botId, name, text } = action.payload || {};
  if (!botId || !text || !String(text).trim()) return;
  if (botId === 'muse') {
    yield put(synthesisAnswerPasted(String(text)));
    yield put(logAdded(`Đã nhận kết luận tổng hợp từ file "${name}" thả lên thẻ Muse.`));
    return;
  }
  yield put(answerPasted({ botId, answer: String(text) }));
  yield put(logAdded(`Đã nhận đáp án từ file "${name}" thả lên thẻ ${botId} — đã ghi vào thư mục của bot.`));
}

function* refreshFilesSaga() {
  const fsx = getFs();
  if (!fsx?.getState) return;
  try {
    const state = yield call(fsx.getState);
    yield put(filesStateLoaded(state));
    const council = yield select(selectCouncil);
    if (council.files.sessionDir) {
      const listed = yield call(fsx.listSessionFiles, council.files.sessionDir);
      if (listed?.files) yield put(sessionFilesUpdated(listed.files));
    }
  } catch (_) { /* bo qua */ }
}

export default function* rootSaga() {
  yield all([
    takeEvery(copyPromptRequested.type, copyPromptSaga),
    takeEvery(pasteAnswerRequested.type, pasteAnswerSaga),
    takeEvery([answerPasted.type, saveAnswer.type], afterSaveSaga),
    takeEvery([synthesisAnswerPasted.type, synthesisSaved.type], afterSynthesisSaga),
    takeEvery(exportRequested.type, exportSaga),
    takeEvery(copySynthesisPromptRequested.type, copySynthesisPromptSaga),
    takeEvery(pasteSynthesisAnswerRequested.type, pasteSynthesisAnswerSaga),
    takeEvery(filesInitRequested.type, filesInitSaga),
    takeEvery(startSession.type, ensureSessionSaga),
    takeEvery(chooseWorkDirRequested.type, chooseWorkDirSaga),
    takeEvery(loadContextRequested.type, loadContextSaga),
    takeEvery(restoreSessionRequested.type, restoreSessionSaga),
    takeEvery(openSessionRequested.type, openSessionSaga),
    takeEvery(dropAnswerFileRequested.type, dropAnswerFileSaga),
    takeEvery(refreshFilesRequested.type, refreshFilesSaga),
  ]);
}
