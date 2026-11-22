// Trich xuat DAP AN cua chatbot ngay trong tab cua no — ban v3 (Extractor v3).
//
// Ban v3 (theo thiet ke da chot docs/thiet-ke-nang-cap-v3.md Muc 2):
//  - Tra ve OBJECT { text, confidence, breakdown, strategy, candidates } thay
//    vi chi text. Confidence cham theo bang 25/20/25/15/10/5 (strategy /
//    length / stability / duplicate / headings / stopVisible).
//  - On dinh: doc trang 2 LAN cach ~1,2 giay roi so do giong — bot con dang
//    go thi diem stability thap, o duyet se canh bao.
//  - Trung: so voi dap an truoc cua chinh bot (saga truyen prevText vao).
//  - Fallback giu thu tu: custom -> default -> scan (cham diem khoi) ->
//    deep/Shadow DOM -> tra candidates de nguoi dung pick.
//
// Ban v1 that bai voi Copilot va mot so trang ChatGPT vi 2 ly do:
//  1) Copilot dung SHADOW DOM — document.querySelectorAll thong thuong khong
//     nhin thay noi dung ben trong. Ban v2 duyet ca shadow root (deep query)
//     va tinh "deep text" gom ca text trong shadow.
//  2) Selector doan san co the khong khop trang that cua tung tai khoan.
//     Ban v2 cho phep NGUOI DUNG tu chon vung dap an ngay tren trang that
//     (che do pick), hoac quet danh sach vung ung vien tu trang that, hoac
//     tu go selector — selector tuy chinh nay THAY/uu tien hon mac dinh va
//     luu ngay tren may nguoi dung (localStorage phia renderer).
//
// Nguyen tac giu nguyen: chi DOC khi nguoi dung bam nut; ket qua ve o nhap
// de duyet roi moi Luu; app khong tu gui, khong tu luu.

const SITE_SELECTORS = {
  chatgpt: [
    '[data-message-author-role="assistant"] .markdown',
    'article [data-message-author-role="assistant"]',
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
    'cib-message-group[type="response"] cib-message',
    'cib-message[type="ai"]',
    '[data-content="ai-message"]',
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
  '[class*="markdown" i]',
];

// Cac ham chay BEN TRONG trang chatbot (noi dung chuoi duoc noi vao moi
// script). Gom: duyet shadow root, deep text, sinh selector tu 1 element.
const PAGE_HELPERS = `
function collectRoots(start) {
  const roots = []; const seen = new Set();
  const stack = [start || document];
  while (stack.length) {
    const r = stack.pop();
    if (!r || seen.has(r)) continue;
    seen.add(r); roots.push(r);
    let els = [];
    try { els = r.querySelectorAll('*'); } catch (_) { continue; }
    for (const el of els) { if (el.shadowRoot) stack.push(el.shadowRoot); }
  }
  return roots;
}
function deepQueryAll(sel) {
  const out = []; const seenEl = new Set();
  for (const root of collectRoots(document)) {
    let els = [];
    try { els = root.querySelectorAll(sel); } catch (_) { continue; }
    for (const el of els) { if (!seenEl.has(el)) { seenEl.add(el); out.push(el); } }
  }
  return out;
}
function deepText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  let t = '';
  const kids = node.childNodes ? Array.from(node.childNodes) : [];
  for (const k of kids) t += deepText(k) + '\\n';
  if (node.shadowRoot) t += deepText(node.shadowRoot);
  return t;
}
function cleanText(t) {
  return String(t || '').replace(/\\u00a0/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim();
}
function textOf(el) {
  const it = cleanText(el.innerText || '');
  if (it.length >= 20) return it;
  return cleanText(deepText(el));
}
function isVisible(el) {
  try { const r = el.getClientRects(); return !!(r && r.length > 0); } catch (_) { return false; }
}
function looksDynamicToken(s) {
  const v = String(s || '');
  if (!v) return false;
  if (/\\d{4,}/.test(v)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(v)) return true;
  if (/^[0-9a-f]{12,}$/i.test(v)) return true;
  if (v.length >= 12 && /[A-Za-z]/.test(v) && /\\d/.test(v) && !/[-_.]/.test(v)) return true;
  return false;
}
function isHashClass(c) {
  if (/\\d{4,}/.test(c)) return true;
  if (c.length >= 10 && /[a-z]/.test(c) && /[A-Z]/.test(c) && /\\d/.test(c)) return true;
  if (c.length >= 24 && /\\d/.test(c)) return true;
  return false;
}
function segmentOf(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id && !looksDynamicToken(el.id)) { try { return '#' + CSS.escape(el.id); } catch (_) { return '#' + el.id; } }
  const dt = el.getAttribute && el.getAttribute('data-testid');
  if (dt && !looksDynamicToken(dt)) return tag + '[data-testid="' + dt + '"]';
  const role = el.getAttribute && el.getAttribute('data-message-author-role');
  if (role) return tag + '[data-message-author-role="' + role + '"]';
  let cls = [];
  if (typeof el.className === 'string') {
    cls = el.className.split(/\\s+/).filter((c) => c && c.length <= 32 && !isHashClass(c)).slice(0, 2);
  }
  let seg = tag + (cls.length ? '.' + cls.join('.') : '');
  const parent = el.parentNode;
  if (parent && parent.children) {
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (sameTag.length > 1) seg += ':nth-of-type(' + (sameTag.indexOf(el) + 1) + ')';
  }
  return seg;
}
function cssPath(el) {
  const parts = []; let node = el; let guard = 0;
  while (node && node.nodeType === 1 && guard < 14) {
    guard += 1;
    parts.unshift(segmentOf(node));
    if (node.id && !looksDynamicToken(node.id)) break;
    let parent = node.parentNode;
    if (!parent) {
      const root = node.getRootNode && node.getRootNode();
      if (root && root.host) { parts.unshift('>>>'); node = root.host; continue; }
      break;
    }
    if (parent.nodeType === 11) { parts.unshift('>>>'); node = parent.host; continue; }
    node = parent;
  }
  let out = '';
  for (const p of parts) {
    if (p === '>>>') out += ' >>> ';
    else out += (out && !out.endsWith('>>> ') ? ' > ' : '') + p;
  }
  return out;
}
function queryCustom(sel) {
  const chunks = String(sel).split('>>>').map((s) => s.trim()).filter(Boolean);
  if (!chunks.length) return [];
  let current = deepQueryAll(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    const next = []; const seenEl = new Set();
    for (const el of current) {
      if (!el.shadowRoot) continue;
      for (const root of collectRoots(el.shadowRoot)) {
        let els = [];
        try { els = root.querySelectorAll(chunks[i]); } catch (_) { continue; }
        for (const e of els) { if (!seenEl.has(e)) { seenEl.add(e); next.push(e); } }
      }
    }
    current = next;
  }
  return current;
}
function queryAny(sel) {
  return String(sel).includes('>>>') ? queryCustom(sel) : deepQueryAll(sel);
}
`;


// ===== Confidence scoring (ban sao cua src/lib/confidence.js — PHAI khop) =====
const STRATEGY_POINTS = { custom: 25, pick: 25, default: 18, dynamic: 15, scan: 10, deep: 5 };

function textSimilarity(a, b) {
  const s1 = String(a || '').replace(/\s+/g, ' ').trim();
  const s2 = String(b || '').replace(/\s+/g, ' ').trim();
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const bigrams = (str) => {
    const map = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const g = str.slice(i, i + 2);
      map.set(g, (map.get(g) || 0) + 1);
    }
    return map;
  };
  const m1 = bigrams(s1); const m2 = bigrams(s2);
  let hit = 0;
  for (const [g, n] of m1) hit += Math.min(n, m2.get(g) || 0);
  const total = (s1.length - 1) + (s2.length - 1);
  return total > 0 ? (2 * hit) / total : 0;
}

function scoreConfidence({ strategy, text, secondText, prevText, requiredHeadings, stopVisible } = {}) {
  const value = String(text || '');
  const breakdown = {};
  breakdown.strategy = STRATEGY_POINTS[strategy] != null ? STRATEGY_POINTS[strategy] : 5;
  const len = value.length;
  breakdown.length = len >= 200 ? 20 : len >= 80 ? 12 : len >= 20 ? 5 : 0;
  if (secondText == null) breakdown.stability = 0;
  else {
    const sim = textSimilarity(value, secondText);
    breakdown.stability = sim >= 0.98 ? 25 : sim >= 0.9 ? 12 : 0;
  }
  if (prevText && String(prevText).trim()) {
    breakdown.duplicate = textSimilarity(value, prevText) >= 0.95 ? 0 : 15;
  } else breakdown.duplicate = 15;
  const headings = Array.isArray(requiredHeadings) ? requiredHeadings.filter(Boolean) : [];
  if (!headings.length) breakdown.headings = 10;
  else {
    const missing = headings.filter((h) => !value.includes(h)).length;
    breakdown.headings = Math.max(0, 10 - missing * 3);
  }
  breakdown.stopVisible = stopVisible ? 0 : 5;
  const confidence = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
  return { confidence, breakdown };
}

// Ban sao Node cua looksDynamicToken/isHashClass trong PAGE_HELPERS (PHAI
// khop logic): nhan dien id/key/class "dong" — doi theo tung cuoc hoi thoai
// (Copilot) — de khong bao gio ghi chung vao selector da luu.
function looksDynamicToken(s) {
  const v = String(s || '');
  if (!v) return false;
  if (/\d{4,}/.test(v)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(v)) return true;
  if (/^[0-9a-f]{12,}$/i.test(v)) return true;
  if (v.length >= 12 && /[A-Za-z]/.test(v) && /\d/.test(v) && !/[-_.]/.test(v)) return true;
  return false;
}
function isHashClass(c) {
  if (/\d{4,}/.test(c)) return true;
  if (c.length >= 10 && /[a-z]/.test(c) && /[A-Z]/.test(c) && /\d/.test(c)) return true;
  if (c.length >= 24 && /\d/.test(c)) return true;
  return false;
}

// Selector tuy chinh DA LUU co con dang tin khong? Tra ve true neu ket qua
// tu selector da luu nhin nhu "het han": qua ngan, trung dap an truoc, hoac
// co ung vien quet/dong dai hon nhieu va khac han — khi do phai BO ket qua
// nay va lay lai bang cac tang dong (khong cham diem custom cho no).
function isStaleCustomResult({ text, prevText, candidates } = {}) {
  const value = String(text || '');
  if (value.length < 80) return true;
  if (prevText && String(prevText).trim() && textSimilarity(value, String(prevText)) >= 0.95) return true;
  const list = Array.isArray(candidates) ? candidates : [];
  let best = null;
  for (const c of list) { if (c && typeof c.length === 'number' && (!best || c.length > best.length)) best = c; }
  if (best && best.length > value.length * 1.8 && best.length - value.length > 200) {
    if (textSimilarity(String(best.preview || ''), value.slice(0, 160)) < 0.5) return true;
  }
  return false;
}

function buildExtractScript(botId, customSelector) {
  const hasCustom = !!(customSelector && String(customSelector).trim());
  const siteSelectors = SITE_SELECTORS[botId] || [];
  return `(() => {
${PAGE_HELPERS}
  const CUSTOM = ${JSON.stringify(hasCustom ? String(customSelector).trim() : '')};
  const BOT = ${JSON.stringify(botId)};
  const SITE = ${JSON.stringify(siteSelectors)};
  const GENERIC = ${JSON.stringify(GENERIC_SELECTORS)};
  const pickFrom = (els) => {
    for (const needVisible of [true, false]) {
      for (let i = els.length - 1; i >= 0; i--) {
        if (needVisible && !isVisible(els[i])) continue;
        const text = textOf(els[i]);
        if (text.length >= 20) return text;
      }
    }
    return '';
  };
  const stopVisible = (() => {
    const STOP_SEL = 'button[data-testid="stop-button"], button[aria-label*="Stop" i], button[aria-label*="stop" i], [aria-label*="Đang tạo" i], button[aria-label*="Dừng" i]';
    try { return deepQueryAll(STOP_SEL).some((el) => isVisible(el)); } catch (_) { return false; }
  })();
  // Quet cac khoi ung vien (dung cho tang scan + danh sach candidates tra ve
  // khi diem tin cay thap de nguoi dung chon lai).
  const BROAD = 'article, model-response, cib-message, cib-message-group, [data-testid], [data-message-author-role], [class*="message" i], [class*="response" i], [class*="markdown" i], [class*="answer" i]';
  const seenText = new Set(); const blocks = [];
  for (const el of deepQueryAll(BROAD)) {
    const tag = el.tagName.toLowerCase();
    if (['nav', 'header', 'footer', 'form', 'textarea', 'button', 'input'].includes(tag)) continue;
    const text = textOf(el);
    if (text.length < 60 || text.length > 40000) continue;
    const key = text.slice(0, 200);
    if (seenText.has(key)) continue;
    seenText.add(key);
    blocks.push({ el, text, selector: cssPath(el) });
  }
  const minimal = blocks.filter((c) => !blocks.some((o) => o !== c && o.text.length < c.text.length && c.text.includes(o.text)));
  const candidates = minimal.slice(-15).map((c) => ({ selector: c.selector, length: c.text.length, preview: c.text.replace(/\s+/g, ' ').slice(0, 160) }));
  const done = (text, strategy, selector) => ({ ok: true, text, strategy, selector: selector || '', stopVisible, candidates });
  // Tang 1: selector tuy chinh cua nguoi dung (da xac nhan tu trang that)
  if (CUSTOM) { const t = pickFrom(queryAny(CUSTOM)); if (t) return done(t, 'custom', CUSTOM); }
  // Tang 2: selector mac dinh theo site + generic
  for (const sel of SITE.concat(GENERIC)) {
    const t = pickFrom(queryAny(sel));
    if (t) return done(t, 'default', sel);
  }
  // Tang 2b (chi Copilot): DONG — Copilot doi key/id moi cuoc hoi thoai nen
  // selector da luu khong bao gio dung lai duoc. Tang nay tim LAI khoi tra
  // loi cuoi cung ngay tai thoi diem lay, bang moc cau truc on dinh trong
  // shadow DOM (khong dung bat ky gia tri da luu nao).
  if (BOT === 'copilot') {
    for (const sel of ['cib-message-group[type="response"]', 'cib-message-group', 'cib-message', '[data-testid="ai-message"]']) {
      const t = pickFrom(queryAny(sel));
      if (t && t.length >= 60) return done(t, 'dynamic', 'copilot-dynamic');
    }
  }
  // Tang 3: scan — khoi ung vien cuoi cung (dap an moi nhat o cuoi trang)
  const lastBlock = minimal[minimal.length - 1];
  if (lastBlock) {
    // Tang 4: deep — neu innerText cua khoi scan qua ngan thi lay deep text
    // (gom ca shadow DOM) cua chinh khoi do.
    const deep = cleanText(deepText(lastBlock.el));
    if (deep.length > lastBlock.text.length) return done(deep, 'deep', lastBlock.selector);
    return done(lastBlock.text, 'scan', lastBlock.selector);
  }
  return { ok: false, error: 'not-found', stopVisible, candidates };
})()`;
}

function buildScanScript() {
  return `(() => {
${PAGE_HELPERS}
  const BROAD = 'article, model-response, cib-message, cib-message-group, [data-testid], [data-message-author-role], [class*="message" i], [class*="response" i], [class*="markdown" i], [class*="answer" i]';
  const seenText = new Set(); const out = [];
  for (const el of deepQueryAll(BROAD)) {
    const tag = el.tagName.toLowerCase();
    if (['nav', 'header', 'footer', 'form', 'textarea', 'button', 'input'].includes(tag)) continue;
    const text = textOf(el);
    if (text.length < 60 || text.length > 40000) continue;
    const key = text.slice(0, 200);
    if (seenText.has(key)) continue;
    seenText.add(key);
    out.push({ selector: cssPath(el), length: text.length, preview: text.replace(/\\s+/g, ' ').slice(0, 160) });
    if (out.length >= 60) break;
  }
  return { ok: true, candidates: out.slice(-15) };
})()`;
}

function buildPickStartScript() {
  return `(() => {
${PAGE_HELPERS}
  if (window.__councilPickCleanup) { try { window.__councilPickCleanup(); } catch (_) {} }
  window.__councilPickResult = null;
  let lastEl = null; let prevOutline = '';
  const banner = document.createElement('div');
  banner.textContent = 'CHE DO CHON VUNG DAP AN: di chuot den khoi dap an cua bot roi BAM vao no. Bam ESC de huy.';
  banner.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#111827;color:#fff;padding:9px 16px;border-radius:9px;font:14px/1.4 sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);pointer-events:none;max-width:90vw;text-align:center';
  document.documentElement.appendChild(banner);
  function cleanup() {
    document.removeEventListener('mouseover', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    if (lastEl) { try { lastEl.style.outline = prevOutline; } catch (_) {} }
    try { banner.remove(); } catch (_) {}
    window.__councilPickCleanup = null;
  }
  function realTarget(e) {
    if (e.composedPath && e.composedPath().length) return e.composedPath()[0];
    return e.target;
  }
  function onMove(e) {
    const el = realTarget(e);
    if (!el || el.nodeType !== 1 || el === banner) return;
    if (lastEl && lastEl !== el) { try { lastEl.style.outline = prevOutline; } catch (_) {} }
    if (lastEl !== el) { prevOutline = el.style.outline || ''; }
    lastEl = el;
    try { el.style.outline = '3px solid #f59e0b'; el.style.outlineOffset = '1px'; } catch (_) {}
  }
  function onClick(e) {
    const el = realTarget(e);
    if (!el || el.nodeType !== 1 || el === banner) return;
    e.preventDefault(); e.stopPropagation();
    const text = textOf(el);
    window.__councilPickResult = { selector: cssPath(el), length: text.length, preview: text.replace(/\\s+/g, ' ').slice(0, 200), textSample: text.slice(0, 300) };
    cleanup();
  }
  function onKey(e) {
    if (e.key === 'Escape') { window.__councilPickResult = { cancelled: true }; cleanup(); }
  }
  document.addEventListener('mouseover', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  window.__councilPickCleanup = cleanup;
  setTimeout(() => { if (window.__councilPickCleanup) cleanup(); }, 180000);
  return { ok: true };
})()`;
}

const PICK_POLL_SCRIPT = `(() => {
  const r = window.__councilPickResult;
  if (r) window.__councilPickResult = null;
  return r || null;
})()`;

const COMPOSER_SELECTORS = {
  chatgpt: ['#prompt-textarea', 'div#prompt-textarea[contenteditable="true"]', 'textarea[data-id="root"]'],
  claude: ['[data-testid="chat-input"][contenteditable="true"]', '.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"]'],
  gemini: ['rich-textarea [contenteditable="true"]', '.ql-editor[contenteditable="true"]', 'textarea'],
  copilot: ['textarea#userInput', 'textarea[name="userInput"]', '#userInput', 'textarea'],
  muse: [],
};

// Doan tim o nhap dung chung cho fill / focus / doc-lai (chay trong trang).
const FIND_COMPOSER_SNIPPET = `
  let el = null; let via = '';
  for (const sel of SPECIFIC) {
    const els = queryAny(sel).filter((e) => isVisible(e) && !e.disabled && !e.readOnly);
    if (els.length) { el = els[els.length - 1]; via = sel; break; }
  }
  if (!el) {
    const all = deepQueryAll('textarea, [contenteditable="true"]').filter((e) => isVisible(e) && !e.disabled && !e.readOnly && e.getAttribute('aria-hidden') !== 'true');
    let best = null; let bestScore = -1;
    for (const cand of all) {
      const hints = [cand.getAttribute('placeholder') || '', cand.getAttribute('aria-label') || '', cand.id || '', cand.getAttribute('name') || ''].join(' ');
      let score = 0;
      if (/message|chat|ask|prompt|reply|hỏi|nhập|tin nhắn/i.test(hints)) score += 5;
      try { const r = cand.getBoundingClientRect(); if (r.top > window.innerHeight * 0.45) score += 2; score += Math.min(3, (r.width * r.height) / 60000); } catch (_) {}
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    el = best; via = 'o-nhap-chung';
  }
`;

function buildFillComposerScript(botId, text) {
  const selectors = [...(COMPOSER_SELECTORS[botId] || [])];
  return `(() => {
${PAGE_HELPERS}
  const TEXT = ${JSON.stringify(text)};
  const SPECIFIC = ${JSON.stringify(selectors)};
${FIND_COMPOSER_SNIPPET}
  if (!el) return { ok: false, error: 'not-found' };
  try { el.focus(); } catch (_) {}
  const isTextControl = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
  if (isTextControl) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, TEXT);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return { ok: true, via };
  }
  // contenteditable: uu tien execCommand insertText (kich hoat dung su kien
  // cua ProseMirror/Lexical), khong duoc moi ghi thang + phat su kien input.
  let done = false;
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges(); sel.addRange(range);
    done = document.execCommand('insertText', false, TEXT);
  } catch (_) { done = false; }
  if (!done || !textOf(el).includes(TEXT.slice(0, 24))) {
    try {
      el.textContent = '';
      TEXT.split('\\n').forEach((line, i) => {
        if (i > 0) el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(line));
      });
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: TEXT }));
    } catch (_) {}
  }
  return { ok: true, via };
})()`;
}

// Chi tim + focus o nhap, tra toa do tam de main process bam chuot that va
// go bang co che goc cua Electron (insertText/paste) — cach duy nhat editor
// cua Gemini (Angular, rich-textarea) cong nhan la nguoi dung da nhap.
function buildFocusComposerScript(botId) {
  const selectors = [...(COMPOSER_SELECTORS[botId] || [])];
  return `(() => {
${PAGE_HELPERS}
  const SPECIFIC = ${JSON.stringify(selectors)};
${FIND_COMPOSER_SNIPPET}
  if (!el) return { ok: false, error: 'not-found' };
  try { el.scrollIntoView({ block: 'center' }); } catch (_) {}
  try { el.focus(); } catch (_) {}
  let x = null; let y = null;
  try { const r = el.getBoundingClientRect(); x = Math.round(r.left + r.width / 2); y = Math.round(r.top + r.height / 2); } catch (_) {}
  const kind = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? 'textarea' : 'editable';
  return { ok: true, x, y, kind, via };
})()`;
}

// Doc lai noi dung dang co trong o nhap — dung de XAC NHAN sau khi dan,
// tranh bao ok gia nhu ban cu (script cu tra ok ke ca khi chu chua vao o).
function buildReadComposerScript(botId) {
  const selectors = [...(COMPOSER_SELECTORS[botId] || [])];
  return `(() => {
${PAGE_HELPERS}
  const SPECIFIC = ${JSON.stringify(selectors)};
${FIND_COMPOSER_SNIPPET}
  if (!el) return { ok: false, error: 'not-found' };
  const isTextControl = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';
  return { ok: true, text: isTextControl ? String(el.value || '') : textOf(el) };
})()`;
}

// Noi dung doc lai co chua phan lon doan vua dan khong? (chuan hoa khoang
// trang; chap nhan neu chua doan mo dau hoac dai >= 80% doan goc).
function composerTextMatches(readText, insertedText) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const a = norm(readText);
  const b = norm(insertedText);
  if (!a || !b) return false;
  if (b.length >= 24 && a.includes(b.slice(0, 24))) return true;
  return a.length >= b.length * 0.8;
}

function noView() {
  return { ok: false, error: 'Tab này chưa được mở trong app — hãy bấm vào thẻ của bot để mở tab trước rồi bấm lại.' };
}

async function runInView(view, script) {
  if (!view || !view.webContents || typeof view.webContents.executeJavaScript !== 'function') return { missing: true };
  try {
    return { value: await view.webContents.executeJavaScript(script, true) };
  } catch (err) {
    return { error: `Không chạy được trong tab: ${String(err && err.message ? err.message : err)}` };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function extractFromView(view, botId, customSelector, opts = {}) {
  if (!view) return noView();
  let effectiveSelector = customSelector || '';
  let staleSelector = false;
  const first = await runInView(view, buildExtractScript(botId, effectiveSelector));
  if (first.missing) return noView();
  if (first.error) return { ok: false, error: first.error };
  let r1 = first.value;
  // Kiem chung selector DA LUU: neu ket qua cua no nhin nhu het han (Copilot
  // doi key moi hoi thoai la truong hop dien hinh) thi bo han ket qua nay,
  // chay lai KHONG dung selector da luu de roi xuong mac dinh -> dong/scan.
  if (r1 && r1.ok && effectiveSelector && r1.strategy === 'custom'
    && isStaleCustomResult({ text: r1.text, prevText: opts.prevText || '', candidates: r1.candidates || [] })) {
    staleSelector = true;
    effectiveSelector = '';
    const retry = await runInView(view, buildExtractScript(botId, ''));
    if (retry && retry.value) r1 = retry.value;
  }
  if (!r1 || !r1.ok || !String(r1.text || '').trim()) {
    return { ok: false, error: 'Không tìm thấy khối đáp án của bot trong tab (bot chưa trả lời xong, hoặc trang đã đổi giao diện). Hãy mở dialog của bot, vào "Cài đặt lấy đáp án" để QUÉT các vùng ứng viên hoặc CHỌN VÙNG trực tiếp trên trang thật — selector bạn chọn sẽ thay mặc định. Cách cũ "Dán từ clipboard" vẫn dùng được.', candidates: (r1 && r1.candidates) || [], staleSelector };
  }
  // Lan doc 2 sau ~1,2s de cham diem on dinh (bot con go thi text se khac).
  await sleep(1200);
  const second = await runInView(view, buildExtractScript(botId, effectiveSelector));
  const r2 = second && second.value && second.value.ok ? second.value : null;
  const text = String(r1.text).trim();
  const { confidence, breakdown } = scoreConfidence({
    strategy: r1.strategy,
    text,
    secondText: r2 ? String(r2.text || '') : null,
    prevText: opts.prevText || '',
    requiredHeadings: opts.requiredHeadings || [],
    stopVisible: !!r1.stopVisible,
  });
  return {
    ok: true,
    text,
    selector: r1.selector || '',
    strategy: r1.strategy || 'deep',
    confidence,
    breakdown,
    candidates: r1.candidates || [],
    staleSelector,
  };
}

async function scanCandidatesInView(view) {
  if (!view) return noView();
  const r = await runInView(view, buildScanScript());
  if (r.missing) return noView();
  if (r.error) return { ok: false, error: r.error };
  const candidates = (r.value && r.value.candidates) || [];
  if (!candidates.length) return { ok: false, error: 'Không quét được vùng nào có nội dung đủ dài trong tab — hãy đợi bot trả lời xong (có đáp án hiện trên trang) rồi quét lại.' };
  return { ok: true, candidates };
}

async function startPickInView(view) {
  if (!view) return noView();
  const r = await runInView(view, buildPickStartScript());
  if (r.missing) return noView();
  if (r.error) return { ok: false, error: r.error };
  return { ok: true };
}

async function pollPickInView(view) {
  if (!view) return { done: true, ok: false, error: 'Tab chưa được mở.' };
  const r = await runInView(view, PICK_POLL_SCRIPT);
  if (r.missing || r.error) return { done: true, ok: false, error: r.error || 'Tab chưa được mở.' };
  if (!r.value) return { done: false };
  if (r.value.cancelled) return { done: true, ok: false, error: 'Bạn đã hủy chọn vùng (ESC).' };
  return { done: true, ok: true, selector: r.value.selector, length: r.value.length, preview: r.value.preview, textSample: r.value.textSample || '' };
}

async function fillComposerInView(view, botId, text) {
  if (!view) return noView();
  const value = String(text || '');
  if (!value.trim()) return { ok: false, error: 'Prompt đang trống.' };
  const wc = view.webContents;
  const notFound = { ok: false, error: 'Không tìm thấy ô nhập của chatbot trong tab (trang có thể chưa tải xong hoặc đã đổi giao diện). Hãy đợi trang tải xong rồi bấm lại, hoặc dùng nút Copy prompt + dán tay (Ctrl+V) như trước.' };
  const verify = async () => {
    const rr = await runInView(view, buildReadComposerScript(botId));
    if (!rr || !rr.value || !rr.value.ok) return false;
    return composerTextMatches(rr.value.text, value);
  };
  const jsFill = async () => {
    const r = await runInView(view, buildFillComposerScript(botId, value));
    if (!r || !r.value || !r.value.ok) return null;
    return (await verify()) ? { ok: true, via: r.value.via } : null;
  };
  const nativePaste = async () => {
    try {
      const { clipboard } = require('electron');
      clipboard.writeText(value);
      if (typeof wc.paste === 'function') { wc.paste(); return true; }
    } catch (_) { /* bo qua */ }
    return false;
  };

  // Buoc 1: tim + focus o nhap trong trang.
  const focusRes = await runInView(view, buildFocusComposerScript(botId));
  if (focusRes.missing) return noView();
  if (focusRes.error) return { ok: false, error: focusRes.error };
  const focus = focusRes.value;
  if (!focus || !focus.ok) {
    const viaJs = await jsFill();
    return viaJs || notFound;
  }

  // O nhap la textarea/input thuong (ChatGPT/Copilot): duong JS cu dang
  // chay tot — giu nguyen, chi them xac nhan doc lai.
  if (focus.kind !== 'editable') {
    const viaJs = await jsFill();
    if (viaJs) return viaJs;
    try { if (typeof wc.insertText === 'function') await wc.insertText(value); } catch (_) { /* bo qua */ }
    if (await verify()) return { ok: true, via: `${focus.via}+native` };
    return { ok: false, error: `Đã thử dán vào ô nhập của ${botId} nhưng đọc lại ô nhập không thấy nội dung. Hãy bấm vào ô nhập trong tab rồi thử lại, hoặc dùng nút Sao chép lời nhắc + dán tay (Ctrl+V).` };
  }

  // contenteditable (dien hinh la Gemini): JS ghi thang KHONG duoc editor
  // cong nhan. Dung nhap lieu GOC cua Electron: bam chuot that vao o nhap,
  // roi insertText; khong duoc thi clipboard + paste. Sau moi cach deu DOC
  // LAI o nhap de xac nhan — khong bao gio bao ok gia nua.
  try {
    if (typeof wc.sendInputEvent === 'function' && focus.x != null && focus.y != null) {
      wc.sendInputEvent({ type: 'mouseDown', x: focus.x, y: focus.y, button: 'left', clickCount: 1 });
      wc.sendInputEvent({ type: 'mouseUp', x: focus.x, y: focus.y, button: 'left', clickCount: 1 });
    }
  } catch (_) { /* bo qua */ }
  let nativeTried = false;
  try {
    if (typeof wc.insertText === 'function') { nativeTried = true; await wc.insertText(value); }
  } catch (_) { /* bo qua */ }
  if (nativeTried && (await verify())) return { ok: true, via: `${focus.via}+native` };
  if ((await nativePaste()) && (await verify())) return { ok: true, via: `${focus.via}+paste` };
  const viaJs = await jsFill();
  if (viaJs) return viaJs;
  return { ok: false, error: `Đã thử dán vào ô nhập của ${botId} bằng cả cơ chế gốc của app lẫn cách cũ nhưng đọc lại ô nhập không thấy nội dung (trang có thể chưa tải xong hoặc đã đổi giao diện). Hãy bấm vào ô nhập trong tab, đợi trang tải xong rồi bấm lại, hoặc dùng nút Sao chép lời nhắc + dán tay (Ctrl+V).` };
}

module.exports = {
  buildExtractScript, buildScanScript, buildPickStartScript, buildFillComposerScript,
  buildFocusComposerScript, buildReadComposerScript, composerTextMatches,
  extractFromView, scanCandidatesInView, startPickInView, pollPickInView, fillComposerInView,
  SITE_SELECTORS, scoreConfidence, textSimilarity, STRATEGY_POINTS,
  looksDynamicToken, isHashClass, isStaleCustomResult, PAGE_HELPERS,
};
