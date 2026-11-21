// Selector lay dap an TUY CHINH theo tung bot — nguoi dung tu chon tu trang
// that (quet ung vien / chon vung truc tiep / tu go) trong dialog cua bot.
// Luu o localStorage tren may nguoi dung (giong Gemini API key), KHONG dua
// vao file phien hay repo. Co selector tuy chinh thi no duoc uu tien truoc
// moi selector mac dinh trong electron/answerExtract.js.

const STORAGE_KEY = 'hoi-dong-answer-selectors';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function getCustomSelector(botId) {
  const value = readAll()[botId];
  return typeof value === 'string' ? value : '';
}

export function setCustomSelector(botId, selector) {
  try {
    const all = readAll();
    const value = String(selector || '').trim();
    if (value) all[botId] = value;
    else delete all[botId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (_) { /* localStorage khong kha dung — bo qua */ }
}

export function clearCustomSelector(botId) {
  setCustomSelector(botId, '');
}
