// Selector lay dap an TUY CHINH theo tung bot — nguoi dung tu chon tu trang
// that (quet ung vien / chon vung truc tiep / tu go) trong dialog cua bot.
// Luu o localStorage tren may nguoi dung (giong Gemini API key), KHONG dua
// vao file phien hay repo. Co selector tuy chinh thi no duoc uu tien truoc
// moi selector mac dinh trong electron/answerExtract.js.
//
// V3 (Muc 2.4 thiet ke): ban ghi moi co kem DAU VAN TAY (fingerprint: do dai
// + 80 ky tu dau cua khoi da xac nhan) va thoi diem xac nhan:
//   { selector, fingerprint: { length, head80 }, confirmedAt }
// Ban ghi cu (chuoi thang) van doc duoc — getCustomSelector tra ve chuoi
// selector trong ca 2 truong hop de tuong thich nguoc.

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

export function getSelectorMeta(botId) {
  const value = readAll()[botId];
  if (typeof value === 'string') return value ? { selector: value, fingerprint: null, confirmedAt: '' } : null;
  if (value && typeof value === 'object' && value.selector) {
    return { selector: value.selector, fingerprint: value.fingerprint || null, confirmedAt: value.confirmedAt || '' };
  }
  return null;
}

export function getCustomSelector(botId) {
  const meta = getSelectorMeta(botId);
  return meta ? meta.selector : '';
}

// fingerprint (tuy chon): { length, head80 } cua khoi noi dung nguoi dung
// vua xac nhan — dung de lan sau phat hien selector tro nham khoi cu.
export function setCustomSelector(botId, selector, fingerprint) {
  try {
    const all = readAll();
    const value = String(selector || '').trim();
    if (value) {
      all[botId] = {
        selector: value,
        fingerprint: fingerprint && (fingerprint.length || fingerprint.head80)
          ? { length: fingerprint.length || 0, head80: String(fingerprint.head80 || '').slice(0, 80) }
          : null,
        confirmedAt: new Date().toISOString(),
      };
    } else delete all[botId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (_) { /* localStorage khong kha dung — bo qua */ }
}

export function clearCustomSelector(botId) {
  setCustomSelector(botId, '');
}
