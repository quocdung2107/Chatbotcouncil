import { createSlice } from '@reduxjs/toolkit';
import { BOTS } from '../lib/council';

export const STATUS = {
  idle: 'idle', // chua lam gi
  prompt_ready: 'prompt_ready', // da copy prompt
  sent: 'sent', // nguoi dung da dan + bam Gui trong trang chatbot
  fetched: 'fetched', // da lay/dan dap an ve o nhap — cho nguoi dung duyet roi moi Luu
  saved: 'saved', // da co dap an luu ve
  skipped: 'skipped', // V3: nguoi dung bam BO QUA bot nay o vong nay (chinh thuc)
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
  coordinator: {
    claimCards: '', formReport: '', synthBrief: '', busy: '', lastError: '', consent: null,
    // Thu ky tu dong (Gemini API chu dong): viec tu dong nao da chay trong
    // phien nay (chong chay lai), nhap phan tich chu de o man hinh bat dau,
    // va dong trang thai viec tu dong gan nhat de panel hien.
    autoRan: { claimCards: false, formCheckRounds: [], synthBrief: false },
    topicDraft: null,
    lastAuto: '',
  },
  // V3 (Muc 6 thiet ke): khung kiem dinh chat luong vong cua Gemini API —
  // { roundN: { botId: { verdict, reasons } } }. MVP moi dung khung + co
  // NEEDS_REVIEW do nguoi dung/Gemini gan; dien day du o V2.
  qualityGate: {},
  // V3: loi toan ven prompt (Muc 3.4) cua lan dan prompt gan nhat bi chan:
  // { botId, round, missing: [] } — BotDialog hien canh bao nay.
  integrityError: null,
  // Cai dat lay dap an nang cao (chi la trang thai giao dien tam thoi):
  // candidates[botId] = danh sach vung ung vien quet tu trang that,
  // picking = botId dang o che do chon vung truc tiep tren trang.
  extractUi: { candidates: {}, lowCandidates: {}, picking: '' },
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
      // KHONG xoa consent o day: nguoi dung co the da dong y ngay tai man
      // hinh bat dau (khi dung Thu ky phan tich chu de) — dong y do phai
      // duoc giu sang phien vua bat dau. Phien moi that su (nut Chu de moi)
      // di qua resetAll nen consent van hoi lai dung 1 lan moi phien.
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
      // V3: kem diem tin cay trich xuat (confidence/breakdown/strategy) neu
      // lay tu tab; dan tu clipboard thi khong co diem.
      const { botId, answer, confidence, breakdown, strategy } = action.payload;
      const cell = state.answers[state.round][botId];
      cell.answer = answer;
      cell.confidence = confidence != null ? confidence : null;
      cell.breakdown = breakdown || null;
      cell.strategy = strategy || '';
      cell.error = '';
      if (cell.status !== STATUS.saved) cell.status = STATUS.fetched;
      const confText = confidence != null ? ` Điểm tin cậy trích xuất: ${confidence}/100.` : '';
      state.log.unshift({ time: timeNow(), text: `Đã lấy đáp án vòng ${state.round} của ${botId} về ô nhập (${answer.length} ký tự) — hãy đọc lại, sửa nếu cần, rồi bấm "Lưu đáp án".${confText}` });
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
    // ---- V3: Skip bot chinh thuc + loi o + toan ven prompt ----
    botSkipped(state, action) {
      const { botId, reason } = action.payload || {};
      const cell = state.answers[state.round]?.[botId];
      if (!cell || cell.status === STATUS.saved) return;
      cell.status = STATUS.skipped;
      cell.skipped = { at: new Date().toISOString(), reason: (reason || '').trim() };
      cell.error = '';
      state.log.unshift({ time: timeNow(), text: `Đã BỎ QUA ${botId} ở vòng ${state.round}${reason ? ` — lý do: ${reason}` : ''}. Vòng sẽ đóng khi các bot còn lại đã lưu (cần tối thiểu 2 đáp án đã lưu để đi tiếp).` });
    },
    cellErrorSet(state, action) {
      const { botId, message } = action.payload || {};
      const cell = state.answers[state.round]?.[botId];
      if (!cell) return;
      cell.error = message || '';
    },
    integrityFailed(state, action) {
      state.integrityError = action.payload || null;
      if (action.payload) {
        state.log.unshift({ time: timeNow(), text: `ĐÃ CHẶN dán prompt vòng ${action.payload.round} cho ${action.payload.botId}: prompt thiếu ${action.payload.missing.join('; ')}. Hãy kiểm tra lại đáp án vòng trước / thẻ luận điểm rồi thử lại.` });
      }
    },
    integrityCleared(state) {
      state.integrityError = null;
    },
    lowCandidatesReady(state, action) {
      const { botId, candidates, confidence } = action.payload || {};
      state.extractUi.lowCandidates[botId] = candidates || [];
      state.log.unshift({ time: timeNow(), text: `Lấy đáp án của ${botId}: điểm tin cậy THẤP (${confidence}/100, dưới 60) nên CHƯA đổ vào ô đáp án. Hãy chọn lại vùng đúng trong dialog của bot (danh sách ứng viên ở dưới ô đáp án) hoặc dùng chế độ chọn vùng trực tiếp, rồi bấm "Lấy đáp án từ tab" lại.` });
    },
    geminiConsentSet(state, action) {
      state.coordinator.consent = !!action.payload;
      state.log.unshift({ time: timeNow(), text: action.payload
        ? 'Bạn đã ĐỒNG Ý gửi nội dung phiên lên Gemini API để điều phối (chỉ trong phiên này).'
        : 'Bạn đã TẮT điều phối Gemini API cho phiên này — app chạy thủ công bằng nguyên văn đáp án như cách cũ.' });
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
    // ---- Thu ky tu dong Gemini API ----
    secretaryAutoMarked(state, action) {
      const { job, round } = action.payload || {};
      if (!state.coordinator.autoRan) state.coordinator.autoRan = { claimCards: false, formCheckRounds: [], synthBrief: false };
      if (job === 'claimCards') state.coordinator.autoRan.claimCards = true;
      if (job === 'synthBrief') state.coordinator.autoRan.synthBrief = true;
      if (job === 'formCheck' && typeof round === 'number' && !state.coordinator.autoRan.formCheckRounds.includes(round)) {
        state.coordinator.autoRan.formCheckRounds.push(round);
      }
    },
    secretaryStatusSet(state, action) {
      state.coordinator.lastAuto = action.payload || '';
    },
    topicDraftReady(state, action) {
      state.coordinator.busy = '';
      state.coordinator.topicDraft = action.payload || null;
      state.log.unshift({ time: timeNow(), text: '🧑‍💼 Thư ký Gemini đã phân tích chủ đề xong — xem bản soạn sẵn ở mục Thư ký trên màn hình bắt đầu, duyệt từng phần rồi bấm nút "Dùng ..." để áp dụng.' });
    },
    // ---- Cai dat lay dap an nang cao ----
    candidatesReady(state, action) {
      const { botId, candidates } = action.payload;
      state.extractUi.candidates[botId] = candidates;
      state.log.unshift({ time: timeNow(), text: `Đã quét trang của ${botId}: tìm thấy ${candidates.length} vùng nội dung ứng viên — mở mục "Cài đặt lấy đáp án" trong dialog của bot để xem trước và chọn vùng đúng.` });
    },
    pickStarted(state, action) {
      state.extractUi.picking = action.payload;
      state.log.unshift({ time: timeNow(), text: `Đã bật chế độ CHỌN VÙNG trên tab ${action.payload}: hãy nhìn sang tab chatbot, di chuột tới khối ĐÁP ÁN của bot (khối sẽ có viền cam) rồi BẤM vào nó. Bấm ESC trong trang để hủy.` });
    },
    pickFinished(state, action) {
      state.extractUi.picking = '';
      if (action.payload) state.log.unshift({ time: timeNow(), text: action.payload });
    },
    selectorApplied(state, action) {
      const { botId, selector, source } = action.payload;
      state.log.unshift({ time: timeNow(), text: `Đã đặt selector lấy đáp án cho ${botId} (${source}): ${selector} — từ giờ nút "Lấy đáp án từ tab" của bot này dùng selector này thay mặc định.` });
    },
    selectorCleared(state, action) {
      state.log.unshift({ time: timeNow(), text: `Đã xóa selector tùy chỉnh của ${action.payload} — quay về selector mặc định.` });
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
      state.coordinator = {
        claimCards: '', formReport: '', synthBrief: '', busy: '', lastError: '', consent: null,
        autoRan: { claimCards: false, formCheckRounds: [], synthBrief: false }, topicDraft: null, lastAuto: '',
        ...(data.coordinator || {}),
      };
      state.coordinator.autoRan = { claimCards: false, formCheckRounds: [], synthBrief: false, ...(state.coordinator.autoRan || {}) };
      if (typeof data.geminiConsent === 'boolean') state.coordinator.consent = data.geminiConsent;
      state.qualityGate = data.qualityGate || {};
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
    fillComposerRequested() {},
    fillSynthesisComposerRequested() {},
    scanCandidatesRequested() {},
    startPickRequested() {},
    applySelectorRequested() {},
    clearSelectorRequested() {},
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
    geminiTopicAnalysisRequested() {},
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
  candidatesReady, pickStarted, pickFinished, selectorApplied, selectorCleared,
  botSkipped, cellErrorSet, integrityFailed, integrityCleared, lowCandidatesReady, geminiConsentSet,
  copyPromptRequested, pasteAnswerRequested, fetchAnswerRequested, exportRequested,
  fillComposerRequested, fillSynthesisComposerRequested,
  scanCandidatesRequested, startPickRequested, applySelectorRequested, clearSelectorRequested,
  copySynthesisPromptRequested, pasteSynthesisAnswerRequested, fetchSynthesisAnswerRequested,
  filesInitRequested, chooseWorkDirRequested, loadContextRequested,
  restoreSessionRequested, openSessionRequested, dropAnswerFileRequested,
  refreshFilesRequested,
  geminiTestRequested, geminiClaimCardsRequested, geminiFormCheckRequested, geminiSynthBriefRequested,
  geminiTopicAnalysisRequested, secretaryAutoMarked, secretaryStatusSet, topicDraftReady,
} = councilSlice.actions;

export default councilSlice.reducer;

// ---- Selectors ----
export const selectCouncil = (state) => state.council;
export const selectCell = (state, round, botId) => state.council.answers[round][botId];
export const selectRoundSavedCount = (state, round) =>
  BOTS.filter((b) => state.council.answers[round][b.id].status === STATUS.saved).length;
export const selectRoundSkippedCount = (state, round) =>
  BOTS.filter((b) => state.council.answers[round][b.id].status === STATUS.skipped).length;
export const selectTotalSavedCount = (state) =>
  [1, 2, 3].reduce((sum, r) => sum + selectRoundSavedCount(state, r), 0);
// V3 (Muc 3.3): vong "du/dong" khi moi bot deu SAVED hoac SKIPPED va co toi
// thieu 2 bot SAVED. Ban cu (chua co Skip) hanh vi khong doi: 4 SAVED.
export const selectRoundComplete = (state, round) => {
  const saved = selectRoundSavedCount(state, round);
  const skipped = selectRoundSkippedCount(state, round);
  return saved + skipped === BOTS.length && saved >= 2;
};
