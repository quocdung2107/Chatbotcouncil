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

// Bot "con bai" cua vong 1: khong bi Skip va co dap an da luu. Thu tu luon
// la thu tu co dinh trong BOTS — ca prompt, parser va ham lap the deu dua
// vao cung thu tu nay nen khong bao gio lech nhau.
export function activeRound1Bots(answers, skippedIds = []) {
  return BOTS.filter((b) => !skippedIds.includes(b.id) && (answers?.[1]?.[b.id]?.answer || '').trim());
}

export function buildClaimCardsPrompt({ topic, answers, botIds }) {
  const active = botIds && botIds.length
    ? BOTS.filter((b) => botIds.includes(b.id))
    : activeRound1Bots(answers);
  const texts = active
    .map((b, i) => `--- THẺ ${i + 1} — BÀI VÒNG 1 CỦA ${b.name.toUpperCase()} ---\n${(answers[1]?.[b.id]?.answer || '').trim()}`)
    .join('\n\n');
  return `Bạn là ĐIỀU PHỐI VIÊN của một hội đồng thảo luận, không phải thành viên tranh luận. Chủ đề: "${topic.title}". Mục tiêu: ${(topic.goal || '').trim() || topic.title}.

Dưới đây là ${active.length} bài vòng 1, đánh số THẺ 1 đến THẺ ${active.length} theo đúng thứ tự. Hãy rút mỗi bài thành MỘT THẺ LUẬN ĐIỂM gọn, giữ nguyên ý chính và căn cứ quan trọng nhất, bỏ ví dụ dài và câu chữ thừa. Mỗi thẻ tối đa 130 chữ.

ĐỊNH DẠNG TRẢ VỀ — BẮT BUỘC TUÂN THỦ TUYỆT ĐỐI (app máy tính sẽ tự tách và tự gắn tên bot, bạn KHÔNG cần và KHÔNG được ghi tên bot):
- Mỗi thẻ bắt đầu bằng một dòng mốc riêng, đúng cú pháp: ===THẺ {số}=== (ví dụ: ===THẺ 1===), theo đúng thứ tự 1, 2, 3... như thứ tự bài đầu vào.
- Nội dung mỗi thẻ theo mẫu:
- Kết luận: ...
- Luận điểm: (đánh mã L1, L2... kèm căn cứ ngắn cho từng luận điểm)
- Rủi ro tự nhận: ...
- Độ tin cậy tự chấm: ...
- Không viết lời mở đầu, không viết kết luận chung, không thêm nhận xét, không chấm điểm, không đề xuất mới.

${texts}`;
}

// Tach cau tra loi cua Gemini API thanh cac khoi tom tat theo thu tu bot.
// Ham thuan, chiu dung form lech cua model theo nhieu tang:
//   1) moc may ===THE n=== / ===THẺ n=== (form chuan app yeu cau);
//   2) cac tieu de ### (gan bot theo ten trong tieu de, khong co ten thi
//      gan theo thu tu xuat hien);
//   3) cat theo vi tri xuat hien cua ten bot trong van ban;
//   4) cuoi cung: chia doan van theo thu tu thanh n phan gan deu.
// Tra ve mang co do dai = so bot truyen vao (bots theo dung thu tu);
// khoi nao khong tach duoc thi de '' de ham lap the tu dien cho do.
export function parseClaimCardSections(text, bots = BOTS) {
  const src = String(text || '');
  const n = bots.length;
  const out = new Array(n).fill('');
  if (!src.trim() || n === 0) return out;
  const clean = (s) => String(s || '')
    .replace(/^\s*#{2,4}\s.*$/m, '') // bo dong tieu de thua o dau khoi
    .trim();

  // Tang 1: moc may danh so.
  const markerRe = /={2,}\s*TH[ẺE]\s*(\d+)\s*={2,}/g;
  const markers = [];
  let m;
  while ((m = markerRe.exec(src)) !== null) markers.push({ num: Number(m[1]), idx: m.index, end: markerRe.lastIndex });
  if (markers.length) {
    for (let i = 0; i < markers.length; i++) {
      const slot = markers[i].num - 1;
      if (slot < 0 || slot >= n || out[slot]) continue;
      const body = src.slice(markers[i].end, i + 1 < markers.length ? markers[i + 1].idx : src.length);
      out[slot] = clean(body);
    }
    if (out.some(Boolean)) return out;
  }

  // Tang 2: tieu de ###.
  const headingRe = /^#{2,4}\s.*$/gm;
  const heads = [];
  while ((m = headingRe.exec(src)) !== null) heads.push({ line: m[0], idx: m.index, end: headingRe.lastIndex });
  if (heads.length >= 2) {
    let nextFree = 0;
    for (let i = 0; i < heads.length; i++) {
      const body = src.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].idx : src.length).trim();
      if (!body) continue;
      const named = bots.findIndex((b) => heads[i].line.toLowerCase().includes(b.name.toLowerCase()));
      let slot = named;
      if (slot < 0 || out[slot]) { while (nextFree < n && out[nextFree]) nextFree += 1; slot = nextFree; }
      if (slot >= 0 && slot < n && !out[slot]) { out[slot] = clean(body); }
    }
    if (out.some(Boolean)) return out;
  }

  // Tang 3: cat theo vi tri ten bot xuat hien.
  const mentions = [];
  bots.forEach((b, slot) => {
    const idx = src.toLowerCase().indexOf(b.name.toLowerCase());
    if (idx >= 0) mentions.push({ slot, idx });
  });
  if (mentions.length >= 2) {
    mentions.sort((a, b) => a.idx - b.idx);
    for (let i = 0; i < mentions.length; i++) {
      const start = mentions[i].idx;
      const body = src.slice(start, i + 1 < mentions.length ? mentions[i + 1].idx : src.length);
      if (!out[mentions[i].slot]) out[mentions[i].slot] = clean(body.replace(/^.*?(?=\n|$)/, '').trim() || body);
    }
    if (out.some(Boolean)) return out;
  }

  // Tang 4: chia doan theo thu tu thanh n phan gan deu.
  const paras = src.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length) {
    const per = Math.ceil(paras.length / n);
    for (let slot = 0; slot < n; slot++) {
      out[slot] = paras.slice(slot * per, (slot + 1) * per).join('\n\n');
    }
  }
  return out;
}

// Tom tat du phong do APP tu lam khi Gemini khong tra khoi tach duoc cho
// mot bot: 2 cau dau cua bai vong 1, cat gon — chi la cho do tam, khong
// phai tom tat that, nhung giu the day du ten bot de prompt vong 2 dung form.
function placeholderSummary(answer) {
  const flat = String(answer || '').replace(/\s+/g, ' ').trim();
  const sentences = flat.match(/[^.!?…]+[.!?…]+/g) || [flat];
  const two = sentences.slice(0, 2).join(' ').trim();
  return `(Thẻ rút gọn tự động — điều phối không tách được phần tóm tắt của bài này)\n${two.slice(0, 320)}`;
}

// APP TU LAP the luan diem tu cac khoi Gemini tra ve: tieu de LUON la
// "### Thẻ của {ten bot}" dung ten bot that — day la chuoi chinh xac ma
// buildPrompt doi thanh ma an danh "Bai A/B/C/D" o vong 2. Model chi cung
// cap NOI DUNG, CODE cung cap FORM — the da luu khong bao gio lech form
// vi model tra ve lach nua.
export function assembleClaimCards({ activeBots, sections, answers }) {
  return activeBots
    .map((b, i) => {
      const section = String(sections?.[i] || '').trim();
      const body = section || placeholderSummary(answers?.[1]?.[b.id]?.answer);
      return `### Thẻ của ${b.name}\n${body}`;
    })
    .join('\n\n');
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

// ---- Thu ky chu de (Phase B): phan tich chu de tho o man hinh bat dau ----
// Gemini API doc chu de nguoi dung vua go, hieu y, roi SOAN SAN: tieu de
// gon, muc tieu/boi canh, tieu chi cham, cau hoi lam ro, prompt mo phien
// theo phong cach hoi dong, va de xuat che do. Nguoi dung duyet tung phan
// roi moi dung — thu ky chi soan nhap, khong tu ap dung.
export function buildTopicAnalysisPrompt({ title, goal }) {
  const rawTitle = String(title || '').trim();
  const rawGoal = String(goal || '').trim();
  return `Bạn là THƯ KÝ của một hội đồng thảo luận gồm 4 chatbot (ChatGPT, Claude, Gemini, Copilot) tranh luận 3 vòng và một người tổng hợp cuối (Muse). Người dùng vừa nhập một chủ đề còn thô. Việc của bạn: hiểu chủ đề, rồi soạn sẵn mọi thứ để người dùng chỉ cần duyệt lại trước khi mở phiên.

Chủ đề người dùng nhập: "${rawTitle}"
Mục tiêu / bối cảnh người dùng ghi thêm: "${rawGoal || '(chưa ghi)'}"

Hãy trả lời bằng tiếng Việt, dùng ĐÚNG 6 tiêu đề sau, mỗi tiêu đề viết nguyên văn kèm dấu hai chấm, theo đúng thứ tự này (không thêm tiêu đề khác, không bọc trong bảng):

TIÊU ĐỀ ĐỀ XUẤT:
(một tiêu đề gọn, rõ, dạng câu hỏi hoặc vấn đề cần quyết định, tối đa 20 chữ)

MỤC TIÊU VÀ BỐI CẢNH:
(2-4 câu: mục tiêu cần đạt, bối cảnh/bên liên quan, giới hạn và ràng buộc suy ra được từ chủ đề; chỗ nào là suy đoán của bạn thì ghi rõ "(cần người dùng xác nhận)")

TIÊU CHÍ CHẤM:
(3-5 dòng, mỗi dòng một tiêu chí chấm đáp án cho chủ đề này, mỗi dòng bắt đầu bằng "- ")

CÂU HỎI LÀM RÕ:
(0-4 câu hỏi người dùng nên trả lời để hội đồng bàn đúng trọng tâm, mỗi câu một dòng bắt đầu bằng "- "; nếu chủ đề đã đủ rõ thì ghi đúng một dòng "- (không có — chủ đề đã đủ rõ)")

PROMPT MỞ PHIÊN:
(một prompt hoàn chỉnh để mở phiên hội đồng cho chủ đề này, gồm: bối cảnh và mục tiêu; các ràng buộc cứng liên quan; yêu cầu vòng 1 mỗi bot đề xuất độc lập theo form: kết luận ngắn, luận điểm chính kèm căn cứ, rủi ro, độ tin cậy tự chấm, điểm cần kiểm chứng; vòng 2 phản biện chéo ẩn danh; vòng 3 tác giả sửa bài; và tiêu chí chấm ở trên. Viết như một văn bản liền mạch để dùng nguyên văn.)

CHẾ ĐỘ ĐỀ XUẤT:
(ghi đúng một chữ "Sâu" hoặc "Nhanh" ở đầu dòng, kèm 1 câu lý do: Sâu = 3 vòng đầy đủ cho chủ đề khó/cần quyết định quan trọng; Nhanh = 1 lượt nối tiếp cho chủ đề dễ)`;
}

const TOPIC_HEADINGS = [
  ['title', 'TIÊU ĐỀ ĐỀ XUẤT:'],
  ['goal', 'MỤC TIÊU VÀ BỐI CẢNH:'],
  ['criteria', 'TIÊU CHÍ CHẤM:'],
  ['questions', 'CÂU HỎI LÀM RÕ:'],
  ['openingPrompt', 'PROMPT MỞ PHIÊN:'],
  ['modeText', 'CHẾ ĐỘ ĐỀ XUẤT:'],
];

// Tach cau tra loi cua thu ky thanh tung truong theo 6 tieu de o tren.
// Ham thuan (khong phu thuoc DOM/API) de test duoc. Thieu muc nao thi
// truong do de trong, khong bao gio nem loi.
export function parseTopicAnalysis(text) {
  const src = String(text || '');
  const out = { title: '', goal: '', criteria: '', questions: [], openingPrompt: '', mode: 'deep', modeReason: '' };
  const found = [];
  for (const [key, heading] of TOPIC_HEADINGS) {
    const idx = src.indexOf(heading);
    if (idx >= 0) found.push({ key, heading, idx });
  }
  found.sort((a, b) => a.idx - b.idx);
  const clean = (s) => String(s || '').replace(/^[\s*#>-]+/, '').replace(/[\s*]+$/, '').trim();
  for (let i = 0; i < found.length; i++) {
    const start = found[i].idx + found[i].heading.length;
    const end = i + 1 < found.length ? found[i + 1].idx : src.length;
    const body = src.slice(start, end).trim();
    const key = found[i].key;
    if (key === 'questions') {
      out.questions = body
        .split('\n')
        .map((line) => line.replace(/^[\s\-•*\d.)]+/, '').trim())
        .filter((line) => line && !/^\(?không có/i.test(line));
    } else if (key === 'modeText') {
      const firstLine = body.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
      out.mode = /nhanh/i.test(firstLine) ? 'fast' : 'deep';
      out.modeReason = clean(body);
    } else if (key === 'title') {
      out.title = clean(body.split('\n').filter((l) => l.trim())[0] || '');
    } else {
      out[key] = body.replace(/^[\s*#]+/, '').trim();
    }
  }
  return out;
}

// Ten bot -> id, de saga biet the luan diem thuoc ve bot nao khi can.
export function botNameOf(id) {
  return BOT_BY_ID[id]?.name || id;
}

// ---- Thu ky tro chuyen tao phien (WS3): nguoi dung chi can nhan chu de
// vao 1 hop chat, thu ky Gemini tu hieu, tu ra soat cac diem can co truoc
// khi tranh luan, va tu soan BAN NHAP phien (tieu de / muc tieu / tieu chi
// / che do / prompt mo dau). Ban nhap nam trong khoi may o CUOI cau tra
// loi — app tach ra, nguoi dung chi thay phan tro chuyen tu nhien.
export function buildSessionDesignPrompt({ messages, draft }) {
  const history = (messages || [])
    .map((msg) => `${msg.role === 'user' ? 'NGƯỜI DÙNG' : 'THƯ KÝ'}: ${String(msg.text || '').trim()}`)
    .join('\n\n');
  const draftText = draft
    ? `\nBẢN NHÁP PHIÊN HIỆN TẠI (bạn đã soạn ở lượt trước — hãy cập nhật nó theo tin nhắn mới nhất, giữ lại phần vẫn đúng):\nTiêu đề: ${draft.title || ''}\nMục tiêu: ${draft.goal || ''}\nTiêu chí: ${draft.criteria || ''}\nChế độ: ${draft.mode === 'fast' ? 'nhanh' : 'sau'}\n`
    : '\nChưa có bản nháp nào — đây là lượt đầu, hãy soạn bản nháp đầu tiên.\n';
  return `Bạn là THƯ KÝ của một hội đồng thảo luận gồm 4 chatbot (ChatGPT, Claude, Gemini, Copilot) tranh luận theo vòng, có một người tổng hợp cuối (Muse). Người dùng đang nhắn tin với bạn để tạo một phiên hội đồng. Bạn nói chuyện tự nhiên, thân thiện, ngắn gọn, bằng tiếng Việt.

Việc của bạn ở MỖI lượt trả lời, theo đúng thứ tự:
1) MỞ ĐẦU bằng việc mô tả lại những gì bạn HIỂU từ tin nhắn của người dùng ("Tôi hiểu bạn muốn...") — phần mô tả này bắt buộc có và phải đứng đầu câu trả lời.
2) Rà soát danh sách kiểm tra trước tranh luận dưới đây, chỉ nêu những điểm CÒN THIẾU hoặc CHƯA RÕ dưới dạng câu hỏi ngắn, thân thiện (điểm nào người dùng đã nói rõ thì bỏ qua, không hỏi lại):
   - Mục tiêu cụ thể muốn đạt được là gì
   - Bối cảnh & thông tin nền liên quan
   - Ràng buộc / giới hạn (thời gian, ngân sách, nguồn lực, điều không được làm...)
   - Tiêu chí chấm, hoặc tiêu chí để chọn kết quả
   - Kết quả mong muốn ở dạng gì (kế hoạch hành động, bảng so sánh, một quyết định, ...)
   - Phạm vi — điều KHÔNG cần bàn tới
   - Chế độ: Sâu (3 vòng, cho việc khó/quan trọng) hay Nhanh (1 lượt, cho việc dễ)
   - Có tài liệu/ngữ cảnh đính kèm không
   Nếu mọi điểm đã đủ rõ, hãy nói phiên đã sẵn sàng và nhắc người dùng có thể bấm nút tạo phiên.
3) Sau đó trình bày ngắn gọn BẢN NHÁP PHIÊN hiện tại của bạn (tiêu đề, mục tiêu, tiêu chí chính, chế độ) để người dùng thấy bạn đang soạn gì. Người dùng có thể nhắn tiếp để sửa nháp ("đổi tiêu chí thành...", "thêm ràng buộc...") — khi đó hãy cập nhật nháp.
${draftText}
CUỐI câu trả lời, BẮT BUỘC thêm khối máy đúng cú pháp sau (app sẽ tự tách khối này ra, người dùng không nhìn thấy nó — nội dung nháp trong khối phải là bản mới nhất, đầy đủ):
===BAN-NHAP===
TIEU_DE: (một dòng tiêu đề phiên)
MUC_TIEU: (mục tiêu + bối cảnh + ràng buộc, có thể nhiều dòng, kết thúc khi tới dòng TIEU_CHI:)
TIEU_CHI: (mỗi tiêu chí một dòng, không đánh số đầu dòng)
CHE_DO: sau (hoặc: nhanh)
PROMPT_MO_DAU: (prompt mở phiên hoàn chỉnh cho hội đồng: bối cảnh, mục tiêu, ràng buộc cứng, nhiệm vụ vòng 1 mỗi bot đề xuất độc lập theo form kết luận/luận điểm/rủi ro/độ tin cậy, vòng 2 phản biện chéo ẩn danh, vòng 3 tác giả sửa bài — viết liền mạch, dùng được nguyên văn)
===KET-THUC===

LƯỢT TRÒ CHUYỆN:
${history}

Hãy trả lời lượt này của THƯ KÝ theo đúng hướng dẫn trên.`;
}

const SESSION_BLOCK_START = '===BAN-NHAP===';
const SESSION_BLOCK_END = '===KET-THUC===';

// Tach cau tra loi cua thu ky tro chuyen: phan nguoi dung thay (displayText)
// va ban nhap may (draft). Ham thuan, test duoc. Khong co khoi may thi
// draft = null va displayText la nguyen van. Truong nao thieu trong khoi
// thi de trong — khong bao gio nem loi.
export function parseSessionDesign(text) {
  const src = String(text || '');
  const start = src.indexOf(SESSION_BLOCK_START);
  if (start < 0) return { displayText: src.trim(), draft: null };
  const displayText = src.slice(0, start).trim();
  const end = src.indexOf(SESSION_BLOCK_END, start);
  const block = src.slice(start + SESSION_BLOCK_START.length, end >= 0 ? end : src.length);
  const fields = {};
  const fieldRe = /^\s*(TIEU_DE|MUC_TIEU|TIEU_CHI|CHE_DO|PROMPT_MO_DAU)\s*:\s?/gm;
  const marks = [];
  let m;
  while ((m = fieldRe.exec(block)) !== null) marks.push({ key: m[1], idx: m.index, end: fieldRe.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const body = block.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].idx : block.length).trim();
    fields[marks[i].key] = body;
  }
  if (!Object.keys(fields).length) return { displayText, draft: null };
  const draft = {
    title: (fields.TIEU_DE || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '',
    goal: fields.MUC_TIEU || '',
    criteria: fields.TIEU_CHI || '',
    mode: /nhanh/i.test((fields.CHE_DO || '').split('\n')[0] || '') ? 'fast' : 'deep',
    openingPrompt: fields.PROMPT_MO_DAU || '',
  };
  return { displayText, draft };
}
