import { createSlice } from '@reduxjs/toolkit';
import { BOTS } from '../lib/council';

export const STATUS = {
  idle: 'idle', // chua lam gi
  prompt_ready: 'prompt_ready', // da copy prompt
  sent: 'sent', // nguoi dung da dan + bam Gui trong trang chatbot
  fetched: 'fetched', // da lay/dan dap an ve o nhap — cho nguoi dung duyet roi moi Luu
  saved: 'saved', // da co dap an luu ve
};

function emptyAnswers() {
  const rounds = {};
  for (const round of [1, 2, 3]) {
    rounds[round] = {};
    for (const bot of BOTS) rounds[round][bot.id] = { status: STATUS.idle, answer: '' };
  }
  return rounds;
}

function emptyFiles() {
  return {
    workDir: '', // thu muc lam viec tren Windows (chi Electron)
    sessionDir: '', // thu muc cua phien hien tai, trong workDir
    sessionFolder: '',
    contextName: '', // file ngu canh nguoi dung nap/keo-tha vao
    contextPath: '',
    contextText: '',
    recentFiles: [], // file gan day (main process luu ben)
    recentSessions: [], // phien gan day (main process luu JSON duoi userData)
    history: [], // cac phien cu quet tu workDir: {dir, folder, title, savedCount, hasSynthesis, updatedAt}
    sessionFiles: [], // file trong thu muc phien: {name, path, size, mtime, lines} — name la duong dan tuong doi, vd "01-chatgpt/vong-1.md"
  };
}

function timeNow() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

const initialState = {
  // mode: 'deep' (mac dinh) = 3 vong day du; 'fast' (opt-in cho chu de de)
  // = 1 luot noi tiep, bot sau doc bai bot truoc roi bo sung/sua.
  topic: { title: '', goal: '', criteriaText: '', mode: 'deep' },
  phase: 'setup', // setup | running | synthesis | done
  round: 1,
  activeBotId: 'chatgpt',
  viewMode: 'tabs', // tabs | grid
  answers: emptyAnswers(),
  // Buoc tong hop cuoi cung o tab Muse (khong nam trong 3 vong x 4 bot).
  synthesis: { status: STATUS.idle, answer: '' },
  // Dieu phoi Gemini API (API key KHONG luu o day — key chi o localStorage
  // rieng cua panel, khong vao phien.json): ket qua dieu phoi cua phien.
  coordinator: { claimCards: '', formReport: '', synthBrief: '', busy: '', lastError: '' },
  files: emptyFiles(),
  log: [],
};

const councilSlice = createSlice({
  name: 'council',
  initialState,
  reducers: {
    topicChanged(state, action) {
      const { field, value } = action.payload;
      state.topic[field] = value;
    },
    startSession(state) {
      if (!state.topic.title.trim()) return;
      state.phase = 'running';
      state.round = 1;
      state.activeBotId = 'chatgpt';
      state.log.unshift({ time: timeNow(), text: `Bắt đầu chủ đề: ${state.topic.title}` });
    },
    selectBot(state, action) {
      state.activeBotId = action.payload;
    },
    setViewMode(state, action) {
      state.viewMode = action.payload;
    },
    promptCopied(state, action) {
      const botId = action.payload;
      const cell = state.answers[state.round][botId];
      if (cell.status === STATUS.idle) cell.status = STATUS.prompt_ready;
      state.log.unshift({ time: timeNow(), text: `Đã copy prompt vòng ${state.round} cho ${botId} — mở tab của bot, mở chat mới, dán và bấm Gửi.` });
    },
    markSent(state, action) {
      const cell = state.answers[state.round][action.payload];
      if (cell.status !== STATUS.saved) cell.status = STATUS.sent;
    },
    answerPasted(state, action) {
      const { botId, answer } = action.payload;
      const cell = state.answers[state.round][botId];
      cell.answer = answer;
      cell.status = STATUS.saved;
      state.log.unshift({ time: timeNow(), text: `Đã lưu đáp án vòng ${state.round} của ${botId} (${answer.length} ký tự).` });
    },
    answerFetched(state, action) {
      // Lay dap an tu tab (1 nut bam) hoac dan tu clipboard: chi dien vao o
      // nhap va danh dau "cho duyet" — CHUA luu, CHUA ghi file, CHUA chuyen
      // vong. Nguoi dung doc lai/sua roi bam "Luu dap an" moi co hieu luc.
      const { botId, answer } = action.payload;
      const cell = state.answers[state.round][botId];
      cell.answer = answer;
      if (cell.status !== STATUS.saved) cell.status = STATUS.fetched;
      state.log.unshift({ time: timeNow(), text: `Đã lấy đáp án vòng ${state.round} của ${botId} về ô nhập (${answer.length} ký tự) — hãy đọc lại, sửa nếu cần, rồi bấm "Lưu đáp án".` });
    },
    answerEdited(state, action) {
      const { botId, answer } = action.payload;
      state.answers[state.round][botId].answer = answer;
    },
    saveAnswer(state, action) {
      const botId = action.payload;
      const cell = state.answers[state.round][botId];
      if (!cell.answer.trim()) return;
      cell.status = STATUS.saved;
      state.log.unshift({ time: timeNow(), text: `Đã lưu đáp án vòng ${state.round} của ${botId} (${cell.answer.length} ký tự).` });
    },
    nextRound(state) {
      if (state.round < 3) {
        state.round += 1;
        state.activeBotId = 'chatgpt';
        state.log.unshift({ time: timeNow(), text: `Chuyển sang vòng ${state.round}. Nhớ mở session/chat mới cho từng bot ở vòng này.` });
      }
    },
    finishSession(state) {
      state.phase = 'synthesis';
      state.activeBotId = 'muse';
      state.viewMode = 'tabs';
      state.log.unshift({ time: timeNow(), text: 'Đủ 12 đáp án (4 bot × 3 vòng). Chuyển sang bước TỔNG HỢP CUỐI: mở tab Muse, copy prompt tổng hợp, dán vào Muse và bấm Gửi, rồi copy kết luận về thẻ Muse ở cột phải.' });
    },
    synthesisPromptCopied(state) {
      if (state.synthesis.status === STATUS.idle) state.synthesis.status = STATUS.prompt_ready;
      state.log.unshift({ time: timeNow(), text: 'Đã copy prompt TỔNG HỢP — mở tab Muse, mở chat mới, dán và bấm Gửi.' });
    },
    synthesisMarkSent(state) {
      if (state.synthesis.status !== STATUS.saved) state.synthesis.status = STATUS.sent;
    },
    synthesisAnswerPasted(state, action) {
      state.synthesis.answer = action.payload;
      state.synthesis.status = STATUS.saved;
      state.phase = 'done';
      state.log.unshift({ time: timeNow(), text: `Đã lưu KẾT LUẬN TỔNG HỢP của Muse (${action.payload.length} ký tự). Bấm "Xuất kết quả" để lưu file có kèm kết luận này.` });
    },
    synthesisAnswerFetched(state, action) {
      state.synthesis.answer = action.payload;
      if (state.synthesis.status !== STATUS.saved) state.synthesis.status = STATUS.fetched;
      state.log.unshift({ time: timeNow(), text: `Đã lấy KẾT LUẬN TỔNG HỢP từ tab Muse về ô nhập (${action.payload.length} ký tự) — hãy đọc lại rồi bấm "Lưu đáp án".` });
    },
    synthesisAnswerEdited(state, action) {
      state.synthesis.answer = action.payload;
    },
    synthesisSaved(state) {
      if (!state.synthesis.answer.trim()) return;
      state.synthesis.status = STATUS.saved;
      state.phase = 'done';
      state.log.unshift({ time: timeNow(), text: `Đã lưu KẾT LUẬN TỔNG HỢP của Muse (${state.synthesis.answer.length} ký tự).` });
    },
    exportDone(state, action) {
      state.log.unshift({ time: timeNow(), text: `Đã xuất kết quả: ${action.payload}` });
    },
    logAdded(state, action) {
      state.log.unshift({ time: timeNow(), text: action.payload });
    },
    logCleared(state) {
      state.log = [];
    },
    // ---- Dieu phoi Gemini API ----
    geminiBusy(state, action) {
      state.coordinator.busy = action.payload || '';
      if (action.payload) state.coordinator.lastError = '';
    },
    geminiFailed(state, action) {
      state.coordinator.busy = '';
      state.coordinator.lastError = action.payload || '';
      state.log.unshift({ time: timeNow(), text: `Gemini API (điều phối) lỗi: ${action.payload}` });
    },
    claimCardsReady(state, action) {
      state.coordinator.busy = '';
      state.coordinator.claimCards = action.payload;
      state.log.unshift({ time: timeNow(), text: `Gemini API đã tóm tắt vòng 1 thành THẺ LUẬN ĐIỂM (${action.payload.length} ký tự) — prompt vòng 2 sẽ dùng thẻ này thay cho nguyên văn 4 bài.` });
    },
    formReportReady(state, action) {
      state.coordinator.busy = '';
      state.coordinator.formReport = action.payload.text;
      state.log.unshift({ time: timeNow(), text: `Gemini API đã kiểm tra form vòng ${action.payload.round} — xem kết quả trong panel Điều phối.` });
    },
    synthBriefReady(state, action) {
      state.coordinator.busy = '';
      state.coordinator.synthBrief = action.payload;
      state.log.unshift({ time: timeNow(), text: `Gemini API đã chuẩn bị GÓI TÓM TẮT trước tổng hợp (${action.payload.length} ký tự) — prompt tổng hợp cho Muse sẽ kèm gói này.` });
    },
    geminiTestOk(state, action) {
      state.coordinator.busy = '';
      state.log.unshift({ time: timeNow(), text: `Gemini API kết nối THÀNH CÔNG bằng model ${action.payload} — key dùng được, vai trò điều phối đã sẵn sàng.` });
    },
    // ---- Workflow file (goi day du) ----
    filesStateLoaded(state, action) {
      const { workDir, recentFiles, recentSessions, history } = action.payload || {};
      if (workDir) state.files.workDir = workDir;
      if (Array.isArray(recentFiles)) state.files.recentFiles = recentFiles;
      if (Array.isArray(recentSessions)) state.files.recentSessions = recentSessions;
      if (Array.isArray(history)) state.files.history = history;
    },
    workDirChanged(state, action) {
      state.files.workDir = action.payload.workDir;
      if (Array.isArray(action.payload.history)) state.files.history = action.payload.history;
      state.log.unshift({ time: timeNow(), text: `Thư mục làm việc: ${action.payload.workDir}` });
    },
    sessionFolderReady(state, action) {
      state.files.sessionDir = action.payload.sessionDir;
      state.files.sessionFolder = action.payload.sessionFolder;
      if (Array.isArray(action.payload.files)) state.files.sessionFiles = action.payload.files;
      state.log.unshift({ time: timeNow(), text: `Thư mục phiên đã sẵn sàng: ${action.payload.sessionDir} — mỗi đáp án sẽ tự ghi thành 1 file riêng trong đó (giữ nguyên 3 vòng).` });
    },
    sessionFilesUpdated(state, action) {
      if (Array.isArray(action.payload)) state.files.sessionFiles = action.payload;
    },
    recentFilesUpdated(state, action) {
      if (Array.isArray(action.payload)) state.files.recentFiles = action.payload;
    },
    historyUpdated(state, action) {
      if (Array.isArray(action.payload)) state.files.history = action.payload;
    },
    contextLoaded(state, action) {
      const { name, path: filePath, text } = action.payload;
      state.files.contextName = name || '';
      state.files.contextPath = filePath || '';
      state.files.contextText = text || '';
      state.log.unshift({ time: timeNow(), text: `Đã nạp file ngữ cảnh "${name}" (${(text || '').length} ký tự) — nội dung sẽ tự đính vào prompt vòng 1 và prompt tổng hợp.` });
    },
    contextCleared(state) {
      state.files.contextName = '';
      state.files.contextPath = '';
      state.files.contextText = '';
      state.log.unshift({ time: timeNow(), text: 'Đã bỏ file ngữ cảnh.' });
    },
    sessionRestored(state, action) {
      const data = action.payload;
      if (!data || !data.topic || !data.answers) return;
      state.topic = data.topic;
      state.answers = data.answers;
      state.synthesis = data.synthesis || { status: STATUS.idle, answer: '' };
      state.coordinator = data.coordinator || { claimCards: '', formReport: '', synthBrief: '', busy: '', lastError: '' };
      state.phase = data.phase || 'running';
      state.round = data.round || 1;
      state.activeBotId = 'chatgpt';
      if (data.files) {
        state.files.sessionDir = data.files.sessionDir || state.files.sessionDir;
        state.files.sessionFolder = data.files.sessionFolder || state.files.sessionFolder;
        state.files.contextName = data.files.contextName || '';
        state.files.contextText = data.files.contextText || '';
      }
      state.log.unshift({ time: timeNow(), text: `Đã mở lại phiên cũ: ${data.topic.title}` });
    },
    resetAll(state) {
      // Giu lai thu muc lam viec + lich su file (cai dat cua may, khong phai cua phien).
      const { workDir, recentFiles, recentSessions, history } = state.files;
      return { ...initialState, files: { ...emptyFiles(), workDir, recentFiles, recentSessions, history } };
    },
    // Cac action duoi day do Saga xu ly (khong doi state truc tiep):
    copyPromptRequested() {},
    pasteAnswerRequested() {},
    fetchAnswerRequested() {},
    exportRequested() {},
    copySynthesisPromptRequested() {},
    pasteSynthesisAnswerRequested() {},
    fetchSynthesisAnswerRequested() {},
    filesInitRequested() {},
    chooseWorkDirRequested() {},
    loadContextRequested() {},
    restoreSessionRequested() {},
    openSessionRequested() {},
    dropAnswerFileRequested() {},
    refreshFilesRequested() {},
    geminiTestRequested() {},
    geminiClaimCardsRequested() {},
    geminiFormCheckRequested() {},
    geminiSynthBriefRequested() {},
  },
});

export const {
  topicChanged, startSession, selectBot, setViewMode, promptCopied, markSent,
  answerPasted, answerEdited, saveAnswer, nextRound, finishSession,
  synthesisPromptCopied, synthesisMarkSent, synthesisAnswerPasted,
  synthesisAnswerFetched, synthesisAnswerEdited, synthesisSaved,
  answerFetched,
  exportDone, logAdded, logCleared, resetAll,
  geminiBusy, geminiFailed, claimCardsReady, formReportReady, synthBriefReady, geminiTestOk,
  filesStateLoaded, workDirChanged, sessionFolderReady, sessionFilesUpdated,
  recentFilesUpdated, historyUpdated, contextLoaded, contextCleared, sessionRestored,
  copyPromptRequested, pasteAnswerRequested, fetchAnswerRequested, exportRequested,
  copySynthesisPromptRequested, pasteSynthesisAnswerRequested, fetchSynthesisAnswerRequested,
  filesInitRequested, chooseWorkDirRequested, loadContextRequested,
  restoreSessionRequested, openSessionRequested, dropAnswerFileRequested,
  refreshFilesRequested,
  geminiTestRequested, geminiClaimCardsRequested, geminiFormCheckRequested, geminiSynthBriefRequested,
} = councilSlice.actions;

export default councilSlice.reducer;

// ---- Selectors ----
export const selectCouncil = (state) => state.council;
export const selectCell = (state, round, botId) => state.council.answers[round][botId];
export const selectRoundSavedCount = (state, round) =>
  BOTS.filter((b) => state.council.answers[round][b.id].status === STATUS.saved).length;
export const selectTotalSavedCount = (state) =>
  [1, 2, 3].reduce((sum, r) => sum + selectRoundSavedCount(state, r), 0);
export const selectRoundComplete = (state, round) => selectRoundSavedCount(state, round) === BOTS.length;
