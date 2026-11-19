// Logic hoi dong phia giao dien — bam dung thiet ke cua hoi_dong.py:
// 3 vong, moi vong moi bot la 1 session moi, dap an theo 1 form thong nhat,
// vong 2 phan bien cheo an danh, vong 3 tac gia tu sua bai.

export const BOTS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', color: '#10a37f' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/', color: '#d97757' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', color: '#1c7dff' },
  { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/', color: '#7b61ff' },
];

export const BOT_BY_ID = Object.fromEntries(BOTS.map((b) => [b.id, b]));

// Vai vong 1 (giong ROLES_V1 trong hoi_dong.py)
export const ROLES_V1 = {
  chatgpt: 'Người đề xuất phương án tổng thể (cấu trúc, bước làm)',
  claude: 'Người phân tích rủi ro và phản ví dụ',
  gemini: 'Người bổ sung góc nhìn / tìm kiếm / đa phương tiện',
  copilot: 'Người kiểm chứng thực tế, nguồn web, tính khả thi',
};

// Vong 2: bot nao phan bien bai cua bot nao (vong tron, khong tu phan bien)
export const CRITIQUE_OF = { chatgpt: 'claude', claude: 'gemini', gemini: 'copilot', copilot: 'chatgpt' };

export const FORM_V1 = `## Kết luận ngắn
(tối đa 3 câu)

## Luận điểm chính
1. ... — căn cứ: ...
2. ... — căn cứ: ...
(tối đa 5 luận điểm)

## Rủi ro / điểm chưa chắc
- ...

## Độ tin cậy
Cao / Trung bình / Thấp — vì: ...

## Cần kiểm chứng thêm
- ... (nếu không có, ghi "Không có")`;

export const FORM_V2 = `## Đồng ý
- [mã luận điểm] ...
## Không đồng ý
- [mã luận điểm] ... — lý do + phản ví dụ: ...
## Điểm bài viết bỏ sót
- ...
## Chấm điểm
- Đúng đắn: x/10 — Khả thi: x/10 — Đầy đủ: x/10`;

const ALIASES = ['A', 'B', 'C', 'D'];

// An danh vong 2: xao thu tu bai theo nguoi nhan (moi nguoi nhan thay mot
// thu tu khac), gan nhan A/B/C/D. Tra ve { aliasOf: {botId: 'A'..}, order: [botId...] }
export function anonymize(recipientId) {
  const idx = BOTS.findIndex((b) => b.id === recipientId);
  const order = BOTS.map((_, i) => BOTS[(i + idx + 1) % BOTS.length].id);
  const aliasOf = {};
  order.forEach((botId, i) => { aliasOf[botId] = ALIASES[i]; });
  return { aliasOf, order };
}

function criteriaLines(criteriaText) {
  const lines = (criteriaText || '').split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines.map((c) => `- ${c}`).join('\n') : '- (chưa có tiêu chí riêng)';
}

// answers: { [round]: { [botId]: { answer } } } — dung prompt cho 1 bot o 1 vong.
export function buildPrompt({ topic, round, botId, answers }) {
  const bot = BOT_BY_ID[botId];
  const goal = (topic.goal || '').trim() || topic.title;
  let role, task, form, context = '';

  if (round === 1) {
    role = ROLES_V1[botId];
    task = `Vai của bạn vòng này: ${role}. Hãy đề xuất phương án của riêng bạn, không cần biết các bot khác nghĩ gì.`;
    form = FORM_V1;
  } else if (round === 2) {
    role = 'Người phản biện (ẩn danh)';
    const targetId = CRITIQUE_OF[botId];
    const { aliasOf, order } = anonymize(botId);
    const cardsText = order
      .map((id) => `--- Bài của ${aliasOf[id]} ---\n${(answers[1]?.[id]?.answer || '').trim()}`)
      .join('\n\n');
    task = `Vai của bạn vòng này: phản biện bài của ${aliasOf[targetId]} (bài của một thành viên vòng 1, đã ẩn danh). Chỉ phản biện bài đó, không phản biện bài khác. Nếu thấy bài khác đúng thì nói rõ đồng ý ở điểm nào.`;
    form = FORM_V2;
    context = `\n\n=== CÁC BÀI VÒNG 1 (đã ẩn danh) ===\n${cardsText}\n`;
  } else {
    role = 'Tác giả sửa bài của chính mình';
    const mine = (answers[1]?.[botId]?.answer || '').trim();
    const criticId = BOTS.find((b) => CRITIQUE_OF[b.id] === botId)?.id;
    const critique = (answers[2]?.[criticId]?.answer || '').trim();
    task = 'Vai của bạn vòng này: tác giả sửa lại bài của chính mình. Đọc các phản biện về bài của bạn, sửa những chỗ đúng, giữ lại những chỗ bạn vẫn bảo vệ được và giải thích vì sao.';
    form = FORM_V1;
    context = `\n\n=== BÀI GỐC CỦA BẠN (VÒNG 1) ===\n${mine}\n\n=== PHẢN BIỆN VỀ BÀI CỦA BẠN (VÒNG 2) ===\n${critique}\n`;
  }

  return `[HỘI ĐỒNG — Chủ đề: ${topic.title} — Vòng ${round}/3 — ${bot.name} — ${role}]
Mục tiêu chung: ${goal}
Tiêu chí chấm:
${criteriaLines(topic.criteriaText)}${context}
Nhiệm vụ vòng này: ${task}
Trả lời ĐÚNG form dưới đây, dưới 800 chữ cho phần chính (trừ phần căn cứ ngắn):
${form}
Quy tắc: không lặp lại phần đã đúng của người khác, chỉ tập trung vào nhiệm vụ vòng này.`;
}

// Xuat toan bo phien lam viec thanh Markdown (nut "Xuat ket qua").
export function buildExportMarkdown(state) {
  const { topic, answers } = state;
  const out = [`# Kết quả Chat Hội Đồng — ${topic.title}`, ''];
  if (topic.goal) out.push(`Mục tiêu: ${topic.goal}`, '');
  for (const round of [1, 2, 3]) {
    out.push(`## Vòng ${round}`, '');
    for (const bot of BOTS) {
      const ans = (answers[round]?.[bot.id]?.answer || '').trim();
      out.push(`### ${bot.name}`, '', ans || '(chưa có đáp án)', '');
    }
  }
  return out.join('\n');
}
