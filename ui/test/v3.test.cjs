// Test MVP V3 — chay bang: npm test  (node --test test/)
// - Lib thuan (confidence / nextAction / promptIntegrity / council) la ESM
//   khong import gi: test nap bang cach copy tam sang .mjs roi import.
// - electron/answerExtract.js la CommonJS: require truc tiep, kem fake-DOM
//   toi thieu de chay script trich xuat trong vm.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UI_DIR = path.join(__dirname, '..');

async function loadEsm(relPath) {
  const src = path.join(UI_DIR, relPath);
  const tmp = `${src}.tmp-test.mjs`;
  fs.copyFileSync(src, tmp);
  try {
    return await import(`file://${tmp}`);
  } finally {
    fs.unlinkSync(tmp);
  }
}

const LONG = ('## Kết luận ngắn\nChọn hướng A. ## Luận điểm chính\n1. Điểm một — căn cứ: dữ kiện. ## Rủi ro\n- Chưa chắc. ## Độ tin cậy\nCao — vì đủ dữ kiện. ## Cần kiểm chứng thêm\n- Không có. ').repeat(2);

// ---------- confidence ----------
test('confidence: truong hop hoan hao dat 100', async () => {
  const { scoreConfidence } = await loadEsm('src/lib/confidence.js');
  const r = scoreConfidence({ strategy: 'custom', text: LONG, secondText: LONG, prevText: 'noi dung khac han', requiredHeadings: ['Kết luận ngắn', 'Luận điểm chính'], stopVisible: false });
  assert.equal(r.confidence, 100);
});

test('confidence: deep + ngan + khong on dinh + trung dap an cu -> duoi 60', async () => {
  const { scoreConfidence } = await loadEsm('src/lib/confidence.js');
  const short = 'Tra loi ngan lap lai';
  const r = scoreConfidence({ strategy: 'deep', text: short, secondText: `${short} them mot doan dang go tiep`, prevText: short, requiredHeadings: ['Kết luận ngắn'], stopVisible: true });
  assert.ok(r.confidence < 60, `confidence=${r.confidence}`);
  assert.equal(r.breakdown.strategy, 5);
  assert.equal(r.breakdown.duplicate, 0);
  assert.equal(r.breakdown.stopVisible, 0);
});

test('confidence: cac band do dai va on dinh mot phan', async () => {
  const { scoreConfidence, confidenceBand } = await loadEsm('src/lib/confidence.js');
  const base = { strategy: 'default', prevText: '', requiredHeadings: [], stopVisible: false };
  assert.equal(scoreConfidence({ ...base, text: 'x'.repeat(250), secondText: 'x'.repeat(250) }).breakdown.length, 20);
  assert.equal(scoreConfidence({ ...base, text: 'x'.repeat(100), secondText: 'x'.repeat(100) }).breakdown.length, 12);
  assert.equal(scoreConfidence({ ...base, text: 'x'.repeat(30), secondText: 'x'.repeat(30) }).breakdown.length, 5);
  // secondText khac ~5% -> stability 12
  const t1 = 'abcdefghij'.repeat(40);
  const t2 = `${'abcdefghij'.repeat(38)}ZZZZZZZZZZZZZZZZZZZZ`;
  const st = scoreConfidence({ ...base, text: t1, secondText: t2 }).breakdown.stability;
  assert.ok(st === 12 || st === 25, `stability=${st}`);
  assert.equal(confidenceBand(95), 'high');
  assert.equal(confidenceBand(70), 'medium');
  assert.equal(confidenceBand(40), 'low');
});

// ---------- nextAction ----------
const ORDER = [
  { id: 'chatgpt', name: 'ChatGPT' }, { id: 'claude', name: 'Claude' },
  { id: 'gemini', name: 'Gemini' }, { id: 'copilot', name: 'Copilot' },
];
const cellsOf = (map) => Object.fromEntries(ORDER.map((b) => [b.id, { status: map[b.id] || 'NOT_READY' }]));

test('nextAction: ERROR duoc uu tien cao nhat', async () => {
  const { computeNextAction } = await loadEsm('src/lib/nextAction.js');
  const a = computeNextAction({ cells: cellsOf({ chatgpt: 'FETCHED', claude: 'ERROR' }), round: 2, botOrder: ORDER });
  assert.equal(a.kind, 'error');
  assert.equal(a.botId, 'claude');
});

test('nextAction: NEEDS_REVIEW truoc FETCHED, FETCHED kem diem tin cay', async () => {
  const { computeNextAction } = await loadEsm('src/lib/nextAction.js');
  const cells = cellsOf({ chatgpt: 'FETCHED', claude: 'NEEDS_REVIEW' });
  cells.chatgpt.confidence = 87;
  assert.equal(computeNextAction({ cells, round: 1, botOrder: ORDER }).kind, 'review');
  const cells2 = cellsOf({ chatgpt: 'FETCHED' });
  cells2.chatgpt.confidence = 87;
  const a2 = computeNextAction({ cells: cells2, round: 1, botOrder: ORDER });
  assert.equal(a2.kind, 'fetched');
  assert.match(a2.text, /87/);
});

test('nextAction: dong vong — 2 SAVED + 2 SKIPPED di tiep duoc, 1 SAVED thi bi chan', async () => {
  const { computeNextAction, roundClosure } = await loadEsm('src/lib/nextAction.js');
  const ok = cellsOf({ chatgpt: 'SAVED', claude: 'SAVED', gemini: 'SKIPPED', copilot: 'SKIPPED' });
  assert.deepEqual(roundClosure(ok, ORDER.map((b) => b.id)), { closed: true, saved: 2, skipped: 2, pending: 0, canProceed: true });
  assert.equal(computeNextAction({ cells: ok, round: 1, botOrder: ORDER }).kind, 'advance');
  const bad = cellsOf({ chatgpt: 'SAVED', claude: 'SKIPPED', gemini: 'SKIPPED', copilot: 'SKIPPED' });
  assert.equal(roundClosure(bad, ORDER.map((b) => b.id)).canProceed, false);
  const blocked = computeNextAction({ cells: bad, round: 1, botOrder: ORDER });
  assert.equal(blocked.kind, 'blocked');
  assert.match(blocked.text, /tối thiểu 2/);
  const r3 = cellsOf({ chatgpt: 'SAVED', claude: 'SAVED', gemini: 'SAVED', copilot: 'SKIPPED' });
  assert.equal(computeNextAction({ cells: r3, round: 3, botOrder: ORDER }).kind, 'synthesis');
});

// ---------- promptIntegrity ----------
test('promptIntegrity: vong 2 du ma + form thi OK, thieu ma thi chan', async () => {
  const { checkPromptIntegrity } = await loadEsm('src/lib/promptIntegrity.js');
  const good = '--- Bài của A ---\nx --- Bài của B ---\ny --- Bài của C ---\nz --- Bài của D ---\nw ## Đồng ý ## Không đồng ý ## Chấm điểm';
  assert.equal(checkPromptIntegrity(good, 2).ok, true);
  const bad = good.replace('Bài của C', 'Bai cua ai do');
  const r = checkPromptIntegrity(bad, 2);
  assert.equal(r.ok, false);
  assert.ok(r.missing.some((m) => m.includes('Bài C')));
});

test('promptIntegrity: vong 3 phai co doi chieu Da doi / Khong doi vi', async () => {
  const { checkPromptIntegrity } = await loadEsm('src/lib/promptIntegrity.js');
  const base = '=== PHẢN BIỆN VỀ BÀI CỦA BẠN ===\n...';
  assert.equal(checkPromptIntegrity(base, 3).ok, false);
  assert.equal(checkPromptIntegrity(`${base}\n- Điểm 1 — Đã đổi: x / Không đổi vì: y`, 3).ok, true);
});

// ---------- council.js: prompt that co skip + form vong 3 ----------
const TOPIC = { title: 'Chu de test', goal: '', criteriaText: '', mode: 'deep' };
const ANSWERS = {
  1: {
    chatgpt: { answer: 'BAI-GPT marker rieng 1' }, claude: { answer: 'BAI-CLAUDE marker rieng 2' },
    gemini: { answer: 'BAI-GEMINI marker rieng 3' }, copilot: { answer: 'BAI-COPILOT marker rieng 4' },
  },
  2: {
    chatgpt: { answer: 'PHAN-BIEN-GPT' }, claude: { answer: 'PHAN-BIEN-CLAUDE' },
    gemini: { answer: 'PHAN-BIEN-GEMINI' }, copilot: { answer: 'PHAN-BIEN-COPILOT' },
  },
  3: {
    chatgpt: { answer: 'CUOI-GPT' }, claude: { answer: 'CUOI-CLAUDE' },
    gemini: { answer: 'CUOI-GEMINI' }, copilot: { answer: 'CUOI-COPILOT' },
  },
};

test('council buildPrompt vong 2: chua du Bai A-D + muc Cham diem', async () => {
  const { buildPrompt } = await loadEsm('src/lib/council.js');
  const p = buildPrompt({ topic: TOPIC, round: 2, botId: 'chatgpt', answers: ANSWERS });
  for (const a of ['A', 'B', 'C', 'D']) assert.ok(p.includes(`Bài của ${a}`) || p.includes(`Bài ${a}`), `thieu Bai ${a}`);
  assert.ok(p.includes('Chấm điểm'));
});

test('council buildPrompt vong 2: bot da Skip vong 1 bi loai khoi prompt', async () => {
  const { buildPrompt } = await loadEsm('src/lib/council.js');
  const p = buildPrompt({ topic: TOPIC, round: 2, botId: 'chatgpt', answers: ANSWERS, skips: { 1: ['claude'] } });
  assert.ok(!p.includes('BAI-CLAUDE marker rieng 2'), 'bai cua bot bi Skip khong duoc nam trong prompt vong 2');
});

test('council buildPrompt vong 3: co doi chieu Da doi / Khong doi vi + phan phan bien', async () => {
  const { buildPrompt } = await loadEsm('src/lib/council.js');
  const p = buildPrompt({ topic: TOPIC, round: 3, botId: 'chatgpt', answers: ANSWERS });
  assert.ok(p.includes('PHẢN BIỆN VỀ BÀI CỦA BẠN'));
  assert.ok(p.includes('Đã đổi'));
  assert.ok(p.includes('Không đổi vì'));
});

test('council buildSynthesisPrompt: co dong "Phien nay thieu" khi co Skip', async () => {
  const { buildSynthesisPrompt } = await loadEsm('src/lib/council.js');
  const p = buildSynthesisPrompt({ topic: TOPIC, answers: ANSWERS, skips: { 3: ['copilot'] } });
  assert.ok(p.includes('Phiên này thiếu: Copilot (bỏ qua ở vòng 3)'));
  assert.ok(p.includes('BỎ QUA vòng này'));
  const p2 = buildSynthesisPrompt({ topic: TOPIC, answers: ANSWERS });
  assert.ok(!p2.includes('Phiên này thiếu:'));
});

// ---------- gemini.js: thu ky chu de (Phase B) ----------
async function loadGemini() {
  const libDir = path.join(UI_DIR, 'src/lib');
  const councilTmp = path.join(libDir, 'council.tmp-test.mjs');
  const geminiTmp = path.join(libDir, 'gemini.tmp-test.mjs');
  fs.copyFileSync(path.join(libDir, 'council.js'), councilTmp);
  const src = fs.readFileSync(path.join(libDir, 'gemini.js'), 'utf8').replace("from './council.js'", "from './council.tmp-test.mjs'");
  fs.writeFileSync(geminiTmp, src);
  try {
    return await import(`file://${geminiTmp}`);
  } finally {
    fs.unlinkSync(councilTmp);
    fs.unlinkSync(geminiTmp);
  }
}

test('gemini buildTopicAnalysisPrompt: chua du 6 tieu de bat buoc', async () => {
  const { buildTopicAnalysisPrompt } = await loadGemini();
  const p = buildTopicAnalysisPrompt({ title: 'Chon huong A hay B', goal: 'ngan sach thap' });
  for (const h of ['TIÊU ĐỀ ĐỀ XUẤT:', 'MỤC TIÊU VÀ BỐI CẢNH:', 'TIÊU CHÍ CHẤM:', 'CÂU HỎI LÀM RÕ:', 'PROMPT MỞ PHIÊN:', 'CHẾ ĐỘ ĐỀ XUẤT:']) {
    assert.ok(p.includes(h), `thieu tieu de ${h}`);
  }
  assert.ok(p.includes('Chon huong A hay B'));
});

test('gemini parseTopicAnalysis: tach du 6 truong, che do Nhanh -> fast', async () => {
  const { parseTopicAnalysis } = await loadGemini();
  const sample = [
    'TIÊU ĐỀ ĐỀ XUẤT:', 'Nên chọn hướng A hay B cho sản phẩm X?',
    '', 'MỤC TIÊU VÀ BỐI CẢNH:', 'Mục tiêu là chốt hướng đi trong quý này. Bối cảnh: đội 3 người, ngân sách thấp.',
    '', 'TIÊU CHÍ CHẤM:', '- Đúng trọng tâm', '- Khả thi với nguồn lực',
    '', 'CÂU HỎI LÀM RÕ:', '- Ngân sách tối đa là bao nhiêu?', '- Hạn chốt quyết định là khi nào?',
    '', 'PROMPT MỞ PHIÊN:', 'Bối cảnh: ... Vòng 1 mỗi bot đề xuất độc lập...',
    '', 'CHẾ ĐỘ ĐỀ XUẤT:', 'Nhanh — chủ đề dễ, cần chốt nhanh.',
  ].join('\n');
  const d = parseTopicAnalysis(sample);
  assert.equal(d.title, 'Nên chọn hướng A hay B cho sản phẩm X?');
  assert.ok(d.goal.startsWith('Mục tiêu là chốt hướng đi'));
  assert.ok(d.criteria.includes('Đúng trọng tâm'));
  assert.deepEqual(d.questions, ['Ngân sách tối đa là bao nhiêu?', 'Hạn chốt quyết định là khi nào?']);
  assert.ok(d.openingPrompt.includes('Vòng 1 mỗi bot đề xuất độc lập'));
  assert.equal(d.mode, 'fast');
  assert.ok(d.modeReason.includes('Nhanh'));
});

test('gemini parseTopicAnalysis: thieu muc thi de trong, khong nem loi; mac dinh Sau', async () => {
  const { parseTopicAnalysis } = await loadGemini();
  const d = parseTopicAnalysis('TIÊU ĐỀ ĐỀ XUẤT:\nChỉ có tiêu đề\n\nCHẾ ĐỘ ĐỀ XUẤT:\nSâu — chủ đề khó, cần bàn kỹ.');
  assert.equal(d.title, 'Chỉ có tiêu đề');
  assert.equal(d.goal, '');
  assert.deepEqual(d.questions, []);
  assert.equal(d.mode, 'deep');
  assert.deepEqual(parseTopicAnalysis(''), { title: '', goal: '', criteria: '', questions: [], openingPrompt: '', mode: 'deep', modeReason: '' });
});

// ---------- extractor (CommonJS) ----------
test('extractor scoreConfidence: khop bang diem thiet ke', () => {
  const ex = require(path.join(UI_DIR, 'electron/answerExtract.js'));
  const perfect = ex.scoreConfidence({ strategy: 'custom', text: LONG, secondText: LONG, prevText: 'khac han', requiredHeadings: ['Kết luận ngắn'], stopVisible: false });
  assert.equal(perfect.confidence, 100);
  const weak = ex.scoreConfidence({ strategy: 'deep', text: 'ngan', secondText: 'ngan nhung dai hon nhieu dang go', prevText: 'ngan', requiredHeadings: ['Kết luận ngắn'], stopVisible: true });
  assert.ok(weak.confidence < 60);
  assert.equal(ex.STRATEGY_POINTS.scan, 10);
  assert.equal(ex.STRATEGY_POINTS.default, 18);
});

test('extractor: STRATEGY_POINTS co dynamic=15 va khop confidence.js', async () => {
  const ex = require(path.join(UI_DIR, 'electron/answerExtract.js'));
  assert.equal(ex.STRATEGY_POINTS.dynamic, 15);
  const { STRATEGY_POINTS } = await loadEsm('src/lib/confidence.js');
  assert.deepEqual(STRATEGY_POINTS, ex.STRATEGY_POINTS);
});

test('extractor: looksDynamicToken / isHashClass nhan dien key dong cua Copilot', () => {
  const ex = require(path.join(UI_DIR, 'electron/answerExtract.js'));
  assert.equal(ex.looksDynamicToken('msg-12345678'), true);
  assert.equal(ex.looksDynamicToken('3f8a2c1e-9b7d-4e5f-a1b2-c3d4e5f6a7b8'), true);
  assert.equal(ex.looksDynamicToken('a1b2c3d4e5f6'), true);
  assert.equal(ex.looksDynamicToken('deadbeefcafe1234'), true);
  assert.equal(ex.looksDynamicToken('prompt-textarea'), false);
  assert.equal(ex.looksDynamicToken('userInput'), false);
  assert.equal(ex.looksDynamicToken('ai-message'), false);
  assert.equal(ex.looksDynamicToken(''), false);
  assert.equal(ex.isHashClass('xY9kQ2wZ8ab1'), true);
  assert.equal(ex.isHashClass('markdown'), false);
  assert.equal(ex.isHashClass('model-response-text'), false);
});

test('extractor: segmentOf bo id dong, giu id on dinh (chay PAGE_HELPERS trong vm)', () => {
  const ex = require(path.join(UI_DIR, 'electron/answerExtract.js'));
  const ctx = vm.createContext({ CSS: { escape: (x) => x }, console });
  vm.runInContext(ex.PAGE_HELPERS, ctx);
  const mkEl = (id) => ({
    tagName: 'DIV', id, className: '', parentNode: null,
    getAttribute: () => null,
  });
  ctx.__elDyn = mkEl('turn-987654321');
  ctx.__elStable = mkEl('userInput');
  const segDyn = vm.runInContext('segmentOf(__elDyn)', ctx);
  const segStable = vm.runInContext('segmentOf(__elStable)', ctx);
  assert.ok(!String(segDyn).includes('987654321'), `segment dong van chua key: ${segDyn}`);
  assert.equal(segStable, '#userInput');
});

test('extractor: isStaleCustomResult bat selector het han', () => {
  const ex = require(path.join(UI_DIR, 'electron/answerExtract.js'));
  const good = 'x'.repeat(300);
  assert.equal(ex.isStaleCustomResult({ text: good, prevText: 'noi dung khac han toan', candidates: [] }), false);
  assert.equal(ex.isStaleCustomResult({ text: 'ngan', prevText: '', candidates: [] }), true);
  assert.equal(ex.isStaleCustomResult({ text: good, prevText: good, candidates: [] }), true);
  assert.equal(ex.isStaleCustomResult({
    text: 'y'.repeat(100), prevText: '',
    candidates: [{ selector: 'div', length: 900, preview: 'noi dung hoan toan khac '.repeat(8) }],
  }), true);
  // Ung vien dai hon nhung CUNG noi dung (ban xem truoc giong) thi khong coi la het han
  assert.equal(ex.isStaleCustomResult({
    text: good, prevText: '',
    candidates: [{ selector: 'div', length: 900, preview: good.slice(0, 160) }],
  }), false);
});

test('extractor: composerTextMatches xac nhan dan thanh cong that', () => {
  const ex = require(path.join(UI_DIR, 'electron/answerExtract.js'));
  const prompt = 'Day la prompt dai can dan vao o nhap cua Gemini de hoi dong thao luan';
  assert.equal(ex.composerTextMatches(prompt, prompt), true);
  assert.equal(ex.composerTextMatches(`  ${prompt.replace(/ /g, '\n')}  `, prompt), true);
  assert.equal(ex.composerTextMatches('', prompt), false);
  assert.equal(ex.composerTextMatches('chi co vai chu', prompt), false);
});

test('extractor: script chay duoc tren fake-DOM va lay dung khoi dap an', () => {
  const ex = require(path.join(UI_DIR, 'electron/answerExtract.js'));
  class El {
    constructor(tag, attrs, text) {
      this.tagName = tag.toUpperCase(); this.attrs = attrs || {}; this.innerText = text || '';
      this.childNodes = []; this.children = []; this.shadowRoot = null; this.parentNode = null;
      this.id = ''; this.className = 'markdown';
    }
    getAttribute(name) { return this.attrs[name] || null; }
    getClientRects() { return [{}]; }
    getRootNode() { return null; }
  }
  const answerEl = new El('div', { 'data-message-author-role': 'assistant' }, LONG);
  const all = [answerEl];
  const documentStub = {
    querySelectorAll(sel) {
      if (String(sel).includes('stop-button') || String(sel).includes('Stop generating')) return [];
      return all;
    },
  };
  const ctx = vm.createContext({ document: documentStub, CSS: { escape: (x) => x }, console });
  const script = ex.buildExtractScript('chatgpt', '');
  const result = vm.runInContext(script, ctx);
  assert.equal(result.ok, true);
  assert.ok(result.text.length >= 200);
  assert.ok(['default', 'scan', 'deep'].includes(result.strategy));
  assert.ok(Array.isArray(result.candidates));
});
