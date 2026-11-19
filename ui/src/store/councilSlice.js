import { createSlice } from '@reduxjs/toolkit';
import { BOTS } from '../lib/council';

export const STATUS = {
  idle: 'idle', // chua lam gi
  prompt_ready: 'prompt_ready', // da copy prompt
  sent: 'sent', // nguoi dung da dan + bam Gui trong trang chatbot
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

function timeNow() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

const initialState = {
  topic: { title: '', goal: '', criteriaText: '' },
  phase: 'setup', // setup | running | synthesis | done
  round: 1,
  activeBotId: 'chatgpt',
  viewMode: 'tabs', // tabs | grid
  answers: emptyAnswers(),
  // Buoc tong hop cuoi cung o tab Muse (khong nam trong 3 vong x 4 bot).
  synthesis: { status: STATUS.idle, answer: '' },
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
    resetAll() {
      return initialState;
    },
    // Cac action duoi day do Saga xu ly (khong doi state truc tiep):
    copyPromptRequested() {},
    pasteAnswerRequested() {},
    exportRequested() {},
    copySynthesisPromptRequested() {},
    pasteSynthesisAnswerRequested() {},
  },
});

export const {
  topicChanged, startSession, selectBot, setViewMode, promptCopied, markSent,
  answerPasted, answerEdited, saveAnswer, nextRound, finishSession,
  synthesisPromptCopied, synthesisMarkSent, synthesisAnswerPasted,
  synthesisAnswerEdited, synthesisSaved,
  exportDone, logAdded, resetAll,
  copyPromptRequested, pasteAnswerRequested, exportRequested,
  copySynthesisPromptRequested, pasteSynthesisAnswerRequested,
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
