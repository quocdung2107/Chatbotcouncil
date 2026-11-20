// Trich xuat DAP AN CUOI CUNG cua chatbot ngay trong tab cua no (nut 1 cham
// "Lay dap an tu tab") — thay cho thao tac boi den + Ctrl+C bang tay.
//
// Cach lam: chay mot doan JavaScript doc DOM trong chinh trang chatbot
// (webContents.executeJavaScript) khi NGUOI DUNG BAM NUT. Chi doc cau tra loi
// assistant gan nhat, dua ve o nhap de nguoi dung DOC LAI roi moi bam Luu —
// app khong tu gui prompt, khong tu luu, khong cao hang loat. Neu trang doi
// giao dien lam trich xuat that bai, app bao loi ro rang va nguoi dung dung
// lai nut "Dan tu clipboard" nhu cu.
//
// Moi site co nhieu selector du phong (theo thu tu uu tien); cuoi cung con
// mot lop fallback chung cho moi bot. Selector co the can cap nhat khi cac
// site doi DOM — loi trich xuat se ghi ro bot nao de bao lai cho de sua.

const SITE_SELECTORS = {
  chatgpt: [
    '[data-message-author-role="assistant"] .markdown',
    '[data-message-author-role="assistant"]',
    '.agent-turn .markdown',
  ],
  claude: [
    '[data-testid="chat_message"] .font-claude-response',
    '.font-claude-response',
    '[data-testid="assistant-message"]',
    '[data-testid="chat-message-content"]',
    '.font-claude-message',
  ],
  gemini: [
    'model-response .model-response-text',
    'model-response message-content',
    '.model-response-text',
    'message-content .markdown-main-panel',
    '[data-testid="model-response"]',
  ],
  copilot: [
    '[data-testid="ai-message"]',
    '[data-content="ai-message"]',
    'cib-message[type="ai"]',
    '.ai-message',
  ],
  muse: [
    '[data-testid="assistant-message"]',
    '[data-role="assistant"]',
    '[data-author="assistant"]',
  ],
};

const GENERIC_SELECTORS = [
  '[data-message-author-role="assistant"]',
  '[data-testid*="assistant" i]',
  '[data-testid*="model-response" i]',
  '[class*="assistant-message" i]',
];

function buildExtractScript(botId) {
  const selectors = [...(SITE_SELECTORS[botId] || []), ...GENERIC_SELECTORS];
  return `(() => {
  const SELECTORS = ${JSON.stringify(selectors)};
  const clean = (t) => String(t || '')
    .replace(/\\u00a0/g, ' ')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();
  for (const sel of SELECTORS) {
    let els = [];
    try { els = Array.from(document.querySelectorAll(sel)); } catch (_) { continue; }
    els = els.filter((e) => {
      const r = e.getClientRects();
      return r && r.length > 0;
    });
    for (let i = els.length - 1; i >= 0; i--) {
      const text = clean(els[i].innerText);
      if (text.length >= 20) return { ok: true, text, selector: sel };
    }
  }
  return { ok: false, error: 'not-found' };
})()`;
}

// view: WebContentsView (hoac doi tuong co webContents.executeJavaScript khi test)
async function extractFromView(view, botId) {
  if (!view || !view.webContents || typeof view.webContents.executeJavaScript !== 'function') {
    return { ok: false, error: 'Tab này chưa được mở trong app — hãy bấm vào thẻ của bot để mở tab trước, đợi bot trả lời xong rồi bấm lại.' };
  }
  let result;
  try {
    result = await view.webContents.executeJavaScript(buildExtractScript(botId), true);
  } catch (err) {
    return { ok: false, error: `Không đọc được nội dung trong tab: ${String(err && err.message ? err.message : err)}` };
  }
  if (!result || !result.ok || !String(result.text || '').trim()) {
    return { ok: false, error: 'Không tìm thấy khối đáp án của bot trong tab (trang có thể đã đổi giao diện, hoặc bot chưa trả lời xong). Hãy đợi bot trả lời xong, hoặc dùng nút "Dán từ clipboard" như cách cũ rồi báo lại bot nào bị lỗi để sửa bộ trích xuất.' };
  }
  return { ok: true, text: String(result.text).trim(), selector: result.selector || '' };
}

module.exports = { buildExtractScript, extractFromView, SITE_SELECTORS };
