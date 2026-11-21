import { all, call, delay, put, select, takeEvery } from 'redux-saga/effects';
import { getCustomSelector, setCustomSelector, clearCustomSelector } from '../lib/answerSettings';
import {
  buildPrompt, buildSynthesisPrompt, buildExportMarkdown,
  buildBriefingText, buildRequestText, sessionFolderName, sessionFileName,
  SYNTH_FILE_NAME, SESSION_JSON_NAME, BOT_BY_ID,
} from '../lib/council';
import { callGemini, buildClaimCardsPrompt, buildFormCheckPrompt, buildSynthBriefPrompt } from '../lib/gemini';
import {
  copyPromptRequested, pasteAnswerRequested, fetchAnswerRequested, exportRequested,
  copySynthesisPromptRequested, pasteSynthesisAnswerRequested, fetchSynthesisAnswerRequested,
  filesInitRequested, chooseWorkDirRequested, loadContextRequested,
  restoreSessionRequested, openSessionRequested, dropAnswerFileRequested,
  refreshFilesRequested,
  geminiTestRequested, geminiClaimCardsRequested, geminiFormCheckRequested, geminiSynthBriefRequested,
  promptCopied, answerPasted, answerFetched, saveAnswer, nextRound, finishSession,
  synthesisPromptCopied, synthesisAnswerPasted, synthesisAnswerFetched, synthesisSaved,
  candidatesReady, pickStarted, pickFinished, selectorApplied, selectorCleared,
  fillComposerRequested, fillSynthesisComposerRequested,
  scanCandidatesRequested, startPickRequested, applySelectorRequested, clearSelectorRequested,
  geminiBusy, geminiFailed, claimCardsReady, formReportReady, synthBriefReady, geminiTestOk,
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
    coordinator: state.coordinator ? { claimCards: state.coordinator.claimCards, formReport: state.coordinator.formReport, synthBrief: state.coordinator.synthBrief } : undefined,
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
  const prompt = buildPrompt({ topic: state.topic, round: state.round, botId, answers: state.answers, contextText: state.files.contextText, claimCards: state.coordinator?.claimCards });
  yield call(clipboardWrite, prompt);
  yield put(promptCopied(botId));
}

// 2) Dan dap an tu clipboard ve o nhap cua bot (cach cu, du phong khi nut
// "Lay dap an tu tab" khong doc duoc trang). Cung chi dien vao o nhap de
// nguoi dung duyet — bam "Luu dap an" moi ghi file/chuyen vong.
function* pasteAnswerSaga(action) {
  const botId = action.payload;
  const text = yield call(clipboardRead);
  if (!text || !String(text).trim()) {
    yield put(logAdded('Clipboard đang trống — hãy copy đáp án trong trang chatbot trước rồi bấm lại nút dán.'));
    return;
  }
  yield put(answerFetched({ botId, answer: String(text) }));
}

// 2b) LAY DAP AN TU TAB bang 1 nut bam: Electron doc khoi dap an assistant
// gan nhat ngay trong tab chatbot (khong can boi den + Ctrl+C), dien vao o
// nhap de nguoi dung doc lai/sua roi moi bam "Luu dap an". Neu nguoi dung
// da dat selector tuy chinh (tu trang that) thi truyen kem de uu tien.
function* fetchAnswerSaga(action) {
  const botId = action.payload;
  const api = getApi();
  if (!api?.extractAnswer) {
    yield put(logAdded('Nút lấy đáp án từ tab chỉ có ở bản app Electron (bản trình duyệt không đọc được nội dung tab khác). Hãy dùng nút "Dán từ clipboard" ở chế độ này.'));
    return;
  }
  const result = yield call(api.extractAnswer, botId, getCustomSelector(botId));
  if (!result?.ok) {
    yield put(logAdded(`Không lấy được đáp án của ${botId}: ${result?.error || 'lỗi không rõ'}`));
    return;
  }
  yield put(answerFetched({ botId, answer: String(result.text) }));
}

// 2d) DAN PROMPT THANG VAO O NHAP cua chatbot trong tab: app dien prompt
// vao dung o nhap cua trang, nguoi dung doc lai ngay trong trang roi TU
// bam Gui — app khong bam Gui ho (giu ranh gioi ban tu dong).
function* fillComposerSaga(action) {
  const botId = action.payload;
  const api = getApi();
  if (!api?.fillComposer) {
    yield put(logAdded('Nút dán prompt vào ô nhập chỉ có ở bản app Electron. Ở bản trình duyệt hãy dùng "Copy prompt" rồi dán tay (Ctrl+V).'));
    return;
  }
  const state = yield select(selectCouncil);
  const prompt = buildPrompt({ topic: state.topic, round: state.round, botId, answers: state.answers, contextText: state.files.contextText, claimCards: state.coordinator?.claimCards });
  const result = yield call(api.fillComposer, botId, prompt);
  if (!result?.ok) {
    yield put(logAdded(`Không dán được prompt vào ô nhập của ${botId}: ${result?.error || 'lỗi không rõ'}`));
    return;
  }
  yield put(promptCopied(botId));
  yield put(logAdded(`Đã dán prompt vòng ${state.round} vào Ô NHẬP của ${botId} — hãy đọc lại ngay trong tab rồi tự bấm Gửi ở trang chatbot.`));
}

function* fillSynthesisComposerSaga() {
  const api = getApi();
  if (!api?.fillComposer) {
    yield put(logAdded('Nút dán prompt vào ô nhập chỉ có ở bản app Electron. Ở bản trình duyệt hãy dùng "Copy prompt" rồi dán tay (Ctrl+V).'));
    return;
  }
  const state = yield select(selectCouncil);
  const prompt = buildSynthesisPrompt({ topic: state.topic, answers: state.answers, contextText: state.files.contextText, synthBrief: state.coordinator?.synthBrief });
  const result = yield call(api.fillComposer, 'muse', prompt);
  if (!result?.ok) {
    yield put(logAdded(`Không dán được prompt tổng hợp vào ô nhập của Muse: ${result?.error || 'lỗi không rõ'}`));
    return;
  }
  yield put(synthesisPromptCopied());
  yield put(logAdded('Đã dán prompt TỔNG HỢP vào Ô NHẬP của tab Muse — hãy đọc lại trong tab rồi tự bấm Gửi.'));
}

// 2e) QUET VUNG UNG VIEN tu trang that cho panel cai dat lay dap an.
function* scanCandidatesSaga(action) {
  const botId = action.payload;
  const api = getApi();
  if (!api?.scanCandidates) {
    yield put(logAdded('Quét vùng ứng viên chỉ có ở bản app Electron.'));
    return;
  }
  const result = yield call(api.scanCandidates, botId);
  if (!result?.ok) {
    yield put(logAdded(`Không quét được vùng ứng viên của ${botId}: ${result?.error || 'lỗi không rõ'}`));
    return;
  }
  yield put(candidatesReady({ botId, candidates: result.candidates }));
}

// 2f) CHON VUNG TRUC TIEP tren trang: bat pick trong tab roi hoi ket qua
// moi giay (toi da 3 phut) cho den khi nguoi dung bam vao 1 khoi.
function* startPickSaga(action) {
  const botId = action.payload;
  const api = getApi();
  if (!api?.startPick || !api?.pollPick) {
    yield put(logAdded('Chọn vùng trực tiếp chỉ có ở bản app Electron.'));
    return;
  }
  const started = yield call(api.startPick, botId);
  if (!started?.ok) {
    yield put(logAdded(`Không bật được chế độ chọn vùng cho ${botId}: ${started?.error || 'lỗi không rõ'}`));
    return;
  }
  yield put(pickStarted(botId));
  for (let i = 0; i < 180; i++) {
    yield delay(1000);
    const r = yield call(api.pollPick, botId);
    if (!r || !r.done) continue;
    if (r.ok && r.selector) {
      yield call(setCustomSelector, botId, r.selector);
      yield put(selectorApplied({ botId, selector: r.selector, source: 'chọn trực tiếp trên trang' }));
      yield put(pickFinished(`Vùng bạn vừa chọn cho ${botId} có ${r.length} ký tự — mở đầu: "${r.preview || ''}". Hãy bấm "Lấy đáp án từ tab" để thử ngay.`));
    } else {
      yield put(pickFinished(`Chọn vùng cho ${botId} không thành công: ${r.error || 'đã hủy'}`));
    }
    return;
  }
  yield put(pickFinished(`Đã hết 3 phút chờ chọn vùng cho ${botId} — bấm lại nút chọn vùng khi sẵn sàng.`));
}

// 2g) Ap dung / xoa selector tuy chinh (tu danh sach ung vien hoac tu go).
function* applySelectorSaga(action) {
  const { botId, selector, source } = action.payload || {};
  if (!selector || !String(selector).trim()) return;
  yield call(setCustomSelector, botId, String(selector).trim());
  yield put(selectorApplied({ botId, selector: String(selector).trim(), source: source || 'tự nhập' }));
}

function* clearSelectorSaga(action) {
  const botId = action.payload;
  yield call(clearCustomSelector, botId);
  yield put(selectorCleared(botId));
}

// 2c) Tuong tu cho ket luan tong hop o tab Muse.
function* fetchSynthesisAnswerSaga() {
  const api = getApi();
  if (!api?.extractAnswer) {
    yield put(logAdded('Nút lấy kết luận từ tab chỉ có ở bản app Electron. Hãy dùng nút "Dán từ clipboard" ở chế độ trình duyệt.'));
    return;
  }
  const result = yield call(api.extractAnswer, 'muse', getCustomSelector('muse'));
  if (!result?.ok) {
    yield put(logAdded(`Không lấy được kết luận từ tab Muse: ${result?.error || 'lỗi không rõ'}`));
    return;
  }
  yield put(synthesisAnswerFetched(String(result.text)));
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
  const prompt = buildSynthesisPrompt({ topic: state.topic, answers: state.answers, contextText: state.files.contextText, synthBrief: state.coordinator?.synthBrief });
  yield call(clipboardWrite, prompt);
  yield put(synthesisPromptCopied());
}

// 6) Dan ket luan tong hop tu clipboard ve o nhap (du phong) — cung cho
// nguoi dung duyet roi moi Luu, giong nut lay tu tab.
function* pasteSynthesisAnswerSaga() {
  const text = yield call(clipboardRead);
  if (!text || !String(text).trim()) {
    yield put(logAdded('Clipboard đang trống — hãy copy kết luận trong tab Muse trước rồi bấm lại nút dán.'));
    return;
  }
  yield put(synthesisAnswerFetched(String(text)));
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

// ---- Dieu phoi Gemini API ----
// Moi action mang { apiKey, model } tu panel dieu phoi (key chi o panel,
// saga khong luu key vao state/file). Loi API -> ghi nhat ky + panel bao loi,
// luong chinh cua hoi dong van chay bang cach cu (fallback nguyen van).

function* geminiCall(payload, busyLabel, prompt) {
  yield put(geminiBusy(busyLabel));
  const result = yield call(callGemini, { apiKey: payload?.apiKey, model: payload?.model, prompt });
  if (!result?.ok) {
    yield put(geminiFailed(result?.error || 'Lỗi không rõ từ Gemini API.'));
    return null;
  }
  return result;
}

function* geminiTestSaga(action) {
  const result = yield call(geminiCall, action.payload, 'test', 'Bạn là điều phối viên của một hội đồng. Trả lời đúng một chữ: OK');
  if (result) yield put(geminiTestOk(result.model || action.payload?.model));
}

function* geminiClaimCardsSaga(action) {
  const state = yield select(selectCouncil);
  const fullState = yield select();
  if (!selectRoundComplete(fullState, 1)) {
    yield put(logAdded('Chưa tóm tắt được: cần đủ 4/4 đáp án vòng 1 trước.'));
    return;
  }
  const result = yield call(geminiCall, action.payload, 'claimCards', buildClaimCardsPrompt({ topic: state.topic, answers: state.answers }));
  if (result) {
    yield put(claimCardsReady(result.text));
    yield call(writeSessionFile, 'dieu-phoi/the-luan-diem-vong-1.md', `# Thẻ luận điểm vòng 1 (Gemini API tóm tắt) — ${state.topic.title}\n\n${result.text}\n`, 'Đã ghi thẻ luận điểm (điều phối Gemini API) vào thư mục phiên');
    yield call(writeSnapshot);
  }
}

function* geminiFormCheckSaga(action) {
  const state = yield select(selectCouncil);
  const round = state.round;
  const hasAny = Object.values(state.answers[round] || {}).some((c) => (c.answer || '').trim());
  if (!hasAny) {
    yield put(logAdded(`Chưa kiểm tra form được: vòng ${round} chưa có đáp án nào.`));
    return;
  }
  const result = yield call(geminiCall, action.payload, 'formCheck', buildFormCheckPrompt({ topic: state.topic, round, answers: state.answers }));
  if (result) yield put(formReportReady({ round, text: result.text }));
}

function* geminiSynthBriefSaga(action) {
  const state = yield select(selectCouncil);
  const fullState = yield select();
  const lastRound = state.topic.mode === 'fast' ? 1 : 3;
  if (!selectRoundComplete(fullState, lastRound)) {
    yield put(logAdded(`Chưa chuẩn bị gói tổng hợp được: cần đủ 4/4 đáp án vòng ${lastRound} trước.`));
    return;
  }
  const result = yield call(geminiCall, action.payload, 'synthBrief', buildSynthBriefPrompt({ topic: state.topic, answers: state.answers }));
  if (result) {
    yield put(synthBriefReady(result.text));
    yield call(writeSessionFile, 'dieu-phoi/goi-tom-tat-truoc-tong-hop.md', `# Gói tóm tắt trước tổng hợp (Gemini API) — ${state.topic.title}\n\n${result.text}\n`, 'Đã ghi gói tóm tắt trước tổng hợp vào thư mục phiên');
    yield call(writeSnapshot);
  }
}

export default function* rootSaga() {
  yield all([
    takeEvery(copyPromptRequested.type, copyPromptSaga),
    takeEvery(pasteAnswerRequested.type, pasteAnswerSaga),
    takeEvery(fetchAnswerRequested.type, fetchAnswerSaga),
    takeEvery(fetchSynthesisAnswerRequested.type, fetchSynthesisAnswerSaga),
    takeEvery(fillComposerRequested.type, fillComposerSaga),
    takeEvery(fillSynthesisComposerRequested.type, fillSynthesisComposerSaga),
    takeEvery(scanCandidatesRequested.type, scanCandidatesSaga),
    takeEvery(startPickRequested.type, startPickSaga),
    takeEvery(applySelectorRequested.type, applySelectorSaga),
    takeEvery(clearSelectorRequested.type, clearSelectorSaga),
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
    takeEvery(geminiTestRequested.type, geminiTestSaga),
    takeEvery(geminiClaimCardsRequested.type, geminiClaimCardsSaga),
    takeEvery(geminiFormCheckRequested.type, geminiFormCheckSaga),
    takeEvery(geminiSynthBriefRequested.type, geminiSynthBriefSaga),
  ]);
}
