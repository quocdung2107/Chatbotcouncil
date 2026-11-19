// Logic DIEU PHOI bang Gemini API phia giao dien — khoi phuc vai tro dieu phoi
// trong thiet ke goc (hoi_dong.py: plan / normalize / finalize), dieu chinh
// cho ban giao dien: Muse (tab tong hop) la nguoi CHOT ket luan cuoi, con
// Gemini API lam 3 viec dieu phoi o giua:
//   1) Tom tat vong 1 thanh THE LUAN DIEM gon -> prompt vong 2 dung the nay
//      thay cho nguyen van 4 bai dai (bot phan bien doc nhanh, it nhieu).
//   2) Kiem tra FORM cua dap an vua luu (dung cac muc bat buoc khong, do tin
//      cay co ly do khong) -> bao cao ngan vao panel dieu phoi + nhat ky.
//   3) Goi tom tat truoc tong hop: nen ban cuoi vong 3 + phan bien vong 2
//      thanh 1 ban tom tat kem theo prompt tong hop cho Muse.
// Khong co key (hoac goi loi) thi app tu roi ve cach cu: prompt dung nguyen
// van dap an — dieu phoi la lop cong them, khong phai dieu kien de chay.

import { BOTS, BOT_BY_ID, FORM_V1, FORM_V2 } from './council.js';

// Google da ngung cap 2.5 Flash-Lite cho nguoi dung moi (thong bao chinh thuc
// khi goi API 2026-11-19) — danh sach nay chi gom model con dung duoc cho
// tai khoan moi: 3.5 Flash-Lite (nhe, mac dinh) va 3.8 Flash (manh hon).
export const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash-lite', name: '3.5 Flash-Lite (nhanh, tiết kiệm hạn mức — khuyên dùng cho tóm tắt/kiểm tra)' },
  { id: 'gemini-3.8-flash', name: '3.8 Flash (mạnh hơn — dùng khi tóm tắt chưa đạt)' },
];
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const LEGACY_MODEL_MAP = {
  'gemini-2.5-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-3.5-flash': 'gemini-3.8-flash',
};
export function resolveGeminiModel(model) {
  if (GEMINI_MODELS.some((m) => m.id === model)) return model;
  return LEGACY_MODEL_MAP[model] || DEFAULT_GEMINI_MODEL;
}

// Goi Gemini: ban Electron di qua main process (window.councilGemini);
// che do trinh duyet thuong thi fetch thang (Google API cho phep CORS).
export async function callGemini({ apiKey, model, prompt }) {
  const bridge = typeof window !== 'undefined' ? window.councilGemini : undefined;
  if (bridge?.generate) return bridge.generate({ apiKey, model, prompt });
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, error: 'Chưa nhập Gemini API key.' };
  model = resolveGeminiModel(model);
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: `Gemini API lỗi: ${data?.error?.message || `HTTP ${res.status}`}` };
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    return text ? { ok: true, text, model } : { ok: false, error: 'Gemini API trả về rỗng.' };
  } catch (err) {
    return { ok: false, error: `Không gọi được Gemini API: ${String(err && err.message ? err.message : err)}` };
  }
}

export function buildClaimCardsPrompt({ topic, answers }) {
  const texts = BOTS
    .map((b) => `--- BÀI VÒNG 1 CỦA ${b.name.toUpperCase()} (mã nội bộ: ${b.id}) ---\n${(answers[1]?.[b.id]?.answer || '').trim()}`)
    .join('\n\n');
  return `Bạn là ĐIỀU PHỐI VIÊN của một hội đồng thảo luận, không phải thành viên tranh luận. Chủ đề: "${topic.title}". Mục tiêu: ${(topic.goal || '').trim() || topic.title}.

Dưới đây là 4 bài vòng 1. Hãy rút mỗi bài thành MỘT THẺ LUẬN ĐIỂM gọn theo đúng mẫu sau, giữ nguyên ý chính và căn cứ quan trọng nhất, bỏ ví dụ dài và câu chữ thừa. Mỗi thẻ tối đa 130 chữ.

Mẫu cho từng thẻ:
### Thẻ của [Tên bot]
- Kết luận: ...
- Luận điểm: (đánh mã L1, L2... kèm căn cứ ngắn cho từng luận điểm)
- Rủi ro tự nhận: ...
- Độ tin cậy tự chấm: ...

Giữ đúng tên bot ở tiêu đề thẻ. Không thêm nhận xét, không chấm điểm, không đề xuất mới.

${texts}`;
}

export function buildFormCheckPrompt({ topic, round, answers }) {
  const form = round === 2 ? FORM_V2 : FORM_V1;
  const texts = BOTS
    .map((b) => `--- ĐÁP ÁN VÒNG ${round} CỦA ${b.name.toUpperCase()} ---\n${(answers[round]?.[b.id]?.answer || '').trim() || '(trống)'}`)
    .join('\n\n');
  return `Bạn là ĐIỀU PHỐI VIÊN kiểm tra hình thức cho hội đồng thảo luận về: "${topic.title}".

Form bắt buộc của vòng ${round} là:
${form}

Hãy kiểm tra 4 đáp án dưới đây và trả về báo cáo NGẮN theo mẫu:
### [Tên bot]: Đạt / Thiếu — [liệt kê mục còn thiếu hoặc lỗi form, tối đa 2 ý; nếu đạt thì ghi "đúng form"]
Chỉ kiểm tra HÌNH THỨC (đủ mục, đúng cấu trúc, độ tin cậy có kèm lý do), không đánh giá nội dung đúng/sai, không viết lại đáp án.

${texts}`;
}

export function buildSynthBriefPrompt({ topic, answers }) {
  const lastRound = topic.mode === 'fast' ? 1 : 3;
  const finals = BOTS
    .map((b) => `--- BẢN CUỐI (VÒNG ${lastRound}) CỦA ${b.name.toUpperCase()} ---\n${(answers[lastRound]?.[b.id]?.answer || '').trim()}`)
    .join('\n\n');
  const critiques = topic.mode === 'fast' ? '(chế độ nhanh: không có vòng phản biện)'
    : BOTS
      .map((b) => `--- PHẢN BIỆN (VÒNG 2) CỦA ${b.name.toUpperCase()} ---\n${(answers[2]?.[b.id]?.answer || '').trim()}`)
      .join('\n\n');
  return `Bạn là ĐIỀU PHỐI VIÊN chuẩn bị gói tóm tắt cho NGƯỜI TỔNG HỢP CUỐI CÙNG của hội đồng về: "${topic.title}". Mục tiêu: ${(topic.goal || '').trim() || topic.title}.

Hãy đọc bản cuối của 4 thành viên + phản biện vòng 2, rồi trả về gói tóm tắt tối đa 450 chữ theo đúng mẫu:
## Điểm thống nhất (cả 4 bài cùng kết luận)
- ...
## Điểm mâu thuẫn chính
- [vấn đề]: [bot nào] chọn ... vì ... ↔ [bot nào] chọn ... vì ...
## Điểm số phản biện vòng 2 (nếu có)
- ...
## Rủi ro chưa được giải quyết ở bản cuối
- ...
Không tự kết luận chọn phương án nào — đó là việc của người tổng hợp. Chỉ nén thông tin trung thực, không thêm ý mới.

=== BẢN CUỐI ===
${finals}

=== PHẢN BIỆN VÒNG 2 ===
${critiques}`;
}

// Ten bot -> id, de saga biet the luan diem thuoc ve bot nao khi can.
export function botNameOf(id) {
  return BOT_BY_ID[id]?.name || id;
}
