// Gemini API — vai DIEU PHOI cua hoi dong (dung thiet ke goc cua hoi_dong.py):
// API khong phai thanh vien tranh luan; no chi tom tat / tao the luan diem,
// kiem tra form dap an va chuan bi goi tom tat cho buoc tong hop cua Muse.
//
// Renderer gui API key theo tung lan goi (key chi luu trong localStorage cua
// app tren may nguoi dung, KHONG ghi vao file phien, KHONG nam trong repo).
// Main process la noi thuc su goi Google API bang fetch cua Node/Electron,
// nen ban Electron khong phu thuoc CORS cua trinh duyet.
// (require('electron') chi goi ben trong createGeminiApi de file nay van
// nap/test duoc bang Node thuan khi can.)

const ALLOWED_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function generateText({ apiKey, model, prompt, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, error: 'Chưa nhập Gemini API key. Hãy dán key (lấy ở Google AI Studio) vào ô "Điều phối Gemini API" rồi thử lại.' };
  const useModel = ALLOWED_MODELS.includes(model) ? model : 'gemini-2.5-flash-lite';
  if (typeof doFetch !== 'function') return { ok: false, error: 'Môi trường này không có fetch để gọi Gemini API.' };
  let res;
  try {
    res = await doFetch(`${API_BASE}/${useModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    });
  } catch (err) {
    return { ok: false, error: `Không gọi được Gemini API (lỗi mạng): ${String(err && err.message ? err.message : err)}` };
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* giu null */ }
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 400 && /API key/i.test(msg)) return { ok: false, error: 'Gemini API key không hợp lệ — kiểm tra lại key ở Google AI Studio.' };
    if (res.status === 429) return { ok: false, error: 'Gemini API báo hết hạn mức miễn phí lúc này (429). Đợi một lát rồi thử lại, hoặc đổi sang model flash-lite.' };
    return { ok: false, error: `Gemini API lỗi: ${msg}` };
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (!text) return { ok: false, error: 'Gemini API trả về rỗng (có thể bị bộ lọc nội dung chặn). Thử lại hoặc rút gọn nội dung gửi đi.' };
  return { ok: true, text, model: useModel };
}

function createGeminiApi() {
  const { ipcMain } = require('electron');
  ipcMain.handle('gemini:generate', async (_e, payload) => generateText(payload || {}));
  return { generateText };
}

module.exports = { createGeminiApi, generateText, ALLOWED_MODELS };
