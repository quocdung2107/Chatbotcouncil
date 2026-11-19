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

// Muse KHONG phai thanh vien thu 5 cua hoi dong: Muse khong tham gia 3 vong
// tranh luan (giu nguyen 4 bot x 3 vong = 12 dap an, vong tron phan bien va
// an danh A-D khong doi). Muse la tab rieng cho BUOC TONG HOP CUOI CUNG sau
// vong 3: doc ban sua cuoi cua ca 4 bot + phan bien vong 2, roi chot ket luan
// chung. Dang nhap trong tab nay la tai khoan Muse cua chinh nguoi dung
// (mo muse.ai, dang nhap 1 lan, partition persist:council-muse nho lai).
export const SYNTH_BOT = { id: 'muse', name: 'Muse — Tổng hợp', url: 'https://muse.ai/', color: '#0082fb' };
export const ALL_VIEWS = [...BOTS, SYNTH_BOT];

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

// ---- Workflow file: ten thu muc / ten file cua 1 phien hoi dong ----
// Moi phien la 1 thu muc trong thu muc lam viec; moi dap an la 1 file rieng
// (giu nguyen 3 vong: <bot>-vong-<1..3>.md), kem file yeu cau, file huong
// dan chung ("training" bang briefing), file tien trinh va phien.json.
export function slugifyTopic(title) {
  const slug = String(title || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 48).replace(/-+$/g, '');
  return slug || 'chu-de';
}

export function sessionFolderName(title, date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}-${slugifyTopic(title)}`;
}

export function sessionFileName(botId, round) {
  return `${botId}-vong-${round}.md`;
}

export const SYNTH_FILE_NAME = 'muse-tong-hop.md';
export const SESSION_JSON_NAME = 'phien.json';

// File "huong dan chung" — cach "training" cac chatbot web mien phi: khong
// fine-tune duoc, nen app dinh kem noi dung nay vao prompt dau tien cua moi
// phien moi va luu san trong thu muc phien de nguoi dung xem lai.
export function buildBriefingText(topic) {
  const goal = (topic.goal || '').trim() || topic.title;
  const roles = BOTS.map((b) => `- ${b.name}: ${ROLES_V1[b.id]}`).join('\n');
  return `# Hướng dẫn chung cho Hội Đồng — ${topic.title}

Mục tiêu chung: ${goal}

## Cách hội đồng làm việc (giữ nguyên 3 vòng)
1. Vòng 1 — Đề xuất mù: mỗi thành viên trả lời độc lập, không thấy bài của nhau.
2. Vòng 2 — Phản biện chéo ẩn danh: phản biện bài được giao (đã ẩn danh A–D), có chấm điểm.
3. Vòng 3 — Tác giả sửa bài: đọc phản biện về bài mình, sửa chỗ đúng, bảo vệ chỗ còn đúng kèm lý do.
Sau vòng 3, Muse (tab tổng hợp) đọc cả 4 bản cuối + phản biện vòng 2 và chốt kết luận cuối cùng.

## Vai vòng 1
${roles}

## Quy tắc bắt buộc
- Trả lời đúng form được giao trong prompt của vòng, không tự đổi form.
- Nêu căn cứ cho luận điểm chính; không chắc thì ghi vào mục Rủi ro / Cần kiểm chứng, không bịa.
- Độ tin cậy phải thành thật (Cao / Trung bình / Thấp kèm lý do).
- Không lặp lại phần đã đúng của người khác; tập trung vào nhiệm vụ của vòng.
`;
}

export function buildRequestText(topic, contextText) {
  const out = [`# Yêu cầu — ${topic.title}`, '', `Mục tiêu: ${(topic.goal || '').trim() || topic.title}`, '', '## Tiêu chí chấm', (topic.criteriaText || '').trim() || '(chưa có tiêu chí riêng)'];
  if (contextText && contextText.trim()) out.push('', '## Ngữ cảnh từ file người dùng nạp vào', '', contextText.trim());
  return out.join('\n');
}

// answers: { [round]: { [botId]: { answer } } } — dung prompt cho 1 bot o 1 vong.
// contextText (tu file nguoi dung nap/keo-tha vao) chi dinh o VONG 1 va buoc
// tong hop — vong 2/3 da co ngu canh la bai vong truoc.
export function buildPrompt({ topic, round, botId, answers, contextText }) {
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

  const userContext = round === 1 && contextText && contextText.trim()
    ? `\n\n=== NGỮ CẢNH TỪ FILE NGƯỜI DÙNG CUNG CẤP ===\n${contextText.trim().slice(0, 12000)}\n`
    : '';
  return `[HỘI ĐỒNG — Chủ đề: ${topic.title} — Vòng ${round}/3 — ${bot.name} — ${role}]
Mục tiêu chung: ${goal}
Tiêu chí chấm:
${criteriaLines(topic.criteriaText)}${context}${userContext}
Nhiệm vụ vòng này: ${task}
Trả lời ĐÚNG form dưới đây, dưới 800 chữ cho phần chính (trừ phần căn cứ ngắn):
${form}
Quy tắc: không lặp lại phần đã đúng của người khác, chỉ tập trung vào nhiệm vụ vòng này.`;
}

export const FORM_SYNTH = `## Kết luận cuối cùng
(phán quyết chung, tối đa 5 câu — phải CHỌN một phương án khi các bài mâu thuẫn, không liệt kê cả hai như nhau)

## Điểm cả hội đồng đã thống nhất
- ...

## Điểm còn tranh cãi — và cách xử lý
- [điểm tranh cãi] → chọn theo bài nào, vì sao

## Phương án được chọn
- Phương án: ...
- Lý do chọn (dựa trên căn cứ mạnh nhất trong các bài, không dựa trên số đông)

## Kế hoạch hành động
1. ... (bước cụ thể, làm được ngay)
2. ...

## Rủi ro còn lại / điều chưa kiểm chứng được
- ...

## Việc cần người dùng quyết định
- ... (nếu không có, ghi "Không có")`;

// Prompt cho buoc tong hop cuoi cung (tab Muse). Dau vao: ban SUA CUOI
// (vong 3) cua ca 4 bot la chinh, kem phan bien vong 2 de Muse thay diem nao
// da bi bat be va cach cac bot cham diem nhau.
export function buildSynthesisPrompt({ topic, answers, contextText }) {
  const goal = (topic.goal || '').trim() || topic.title;
  const finalText = BOTS
    .map((b) => `--- BẢN CUỐI (VÒNG 3) CỦA ${b.name.toUpperCase()} ---\n${(answers[3]?.[b.id]?.answer || '').trim() || '(chưa có đáp án)'}`)
    .join('\n\n');
  const critiqueText = BOTS
    .map((b) => `--- PHẢN BIỆN (VÒNG 2) CỦA ${b.name.toUpperCase()} ---\n${(answers[2]?.[b.id]?.answer || '').trim() || '(chưa có đáp án)'}`)
    .join('\n\n');
  return `[HỘI ĐỒNG — Chủ đề: ${topic.title} — BƯỚC TỔNG HỢP CUỐI CÙNG — Muse]
Mục tiêu chung: ${goal}
Tiêu chí chấm:
${criteriaLines(topic.criteriaText)}${contextText && contextText.trim() ? `\n\n=== NGỮ CẢNH TỪ FILE NGƯỜI DÙNG CUNG CẤP ===\n${contextText.trim().slice(0, 12000)}\n` : ''}

Vai của bạn: NGƯỜI TỔNG HỢP CUỐI CÙNG của hội đồng. Bạn không phải thành viên tranh luận thứ 5 và không viết thêm một phương án riêng cạnh tranh với 4 bài dưới đây. Việc của bạn là đọc cả 4 bản cuối + các phản biện, rồi CHỐT một kết luận chung cho người dùng.
Quy tắc tổng hợp:
- Không cộng trung bình, không tóm tắt lần lượt từng bài. Chỗ nào các bài mâu thuẫn, phải chọn một phía và nói rõ vì sao (căn cứ nào mạnh hơn).
- Điểm nào cả 4 bài cùng thống nhất thì coi là đáng tin, nêu ngắn gọn.
- Giữ lại các rủi ro và điểm chưa kiểm chứng mà phản biện vòng 2 đã chỉ ra nhưng bản cuối chưa giải quyết được.
- Kế hoạch hành động phải cụ thể tới mức người dùng làm theo được ngay, bám đúng bối cảnh trong chủ đề/mục tiêu ở trên.

=== BẢN CUỐI CỦA 4 THÀNH VIÊN (VÒNG 3 — ĐÃ SỬA SAU PHẢN BIỆN) ===
${finalText}

=== PHẢN BIỆN VÒNG 2 (để đối chiếu điểm yếu và điểm số) ===
${critiqueText}

Trả lời ĐÚNG form dưới đây:
${FORM_SYNTH}`;
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
  const synth = (state.synthesis?.answer || '').trim();
  if (synth) out.push('## Kết luận tổng hợp cuối cùng — Muse', '', synth, '');
  return out.join('\n');
}
