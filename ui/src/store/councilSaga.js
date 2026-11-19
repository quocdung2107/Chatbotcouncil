import { all, call, put, select, takeEvery } from 'redux-saga/effects';
import { buildPrompt, buildExportMarkdown } from '../lib/council';
import {
  copyPromptRequested, pasteAnswerRequested, exportRequested,
  promptCopied, answerPasted, saveAnswer, nextRound, finishSession,
  exportDone, logAdded, selectCouncil, selectRoundComplete,
} from './councilSlice';

// Cau noi Electron (preload). Khi chay bang trinh duyet de dev giao dien,
// window.councilApi khong ton tai — saga tu roi ve navigator.clipboard.
function getApi() {
  return typeof window !== 'undefined' ? window.councilApi : undefined;
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

// 1) Copy prompt cua bot dang xet o vong hien tai vao clipboard
function* copyPromptSaga(action) {
  const botId = action.payload;
  const state = yield select(selectCouncil);
  const prompt = buildPrompt({ topic: state.topic, round: state.round, botId, answers: state.answers });
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

// 3) Sau moi lan luu dap an: du 4/4 cua vong thi tu chuyen vong / ket thuc
function* afterSaveSaga() {
  const state = yield select();
  if (state.council.phase !== 'running') return;
  if (!selectRoundComplete(state, state.council.round)) return;
  if (state.council.round < 3) yield put(nextRound());
  else yield put(finishSession());
}

// 4) Xuat toan bo phien thanh file Markdown
function* exportSaga() {
  const state = yield select(selectCouncil);
  const markdown = buildExportMarkdown(state);
  const api = getApi();
  if (api?.saveTextFile) {
    const result = yield call(api.saveTextFile, 'ket-qua-hoi-dong.md', markdown);
    if (result?.saved) yield put(exportDone(result.path));
    else yield put(logAdded('Đã huỷ xuất file.'));
  } else {
    yield put(logAdded('Xuất file cần chạy trong app Electron (trình duyệt chỉ xem giao diện).'));
  }
}

export default function* rootSaga() {
  yield all([
    takeEvery(copyPromptRequested.type, copyPromptSaga),
    takeEvery(pasteAnswerRequested.type, pasteAnswerSaga),
    takeEvery([answerPasted.type, saveAnswer.type], afterSaveSaga),
    takeEvery(exportRequested.type, exportSaga),
  ]);
}
