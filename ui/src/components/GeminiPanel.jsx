import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL, resolveGeminiModel } from '../lib/gemini';
import {
  geminiTestRequested, geminiClaimCardsRequested, geminiFormCheckRequested, geminiSynthBriefRequested,
  selectRoundSavedCount, selectRoundComplete, geminiConsentSet,
} from '../store/councilSlice';

const KEY_STORAGE = 'hoi-dong-gemini-api-key';
const MODEL_STORAGE = 'hoi-dong-gemini-model';
const SECRETARY_STORAGE = 'hoi-dong-secretary-auto';
const BUSY_LABELS = {
  test: 'kiểm tra kết nối', claimCards: 'tóm tắt thẻ luận điểm', formCheck: 'kiểm tra form',
  synthBrief: 'chuẩn bị gói tổng hợp', topicAnalysis: 'phân tích chủ đề',
};

// Panel DIEU PHOI Gemini API — khoi phuc vai tro dieu phoi trong thiet ke goc:
// API khong tranh luan, no tom tat / kiem tra form / chuan bi goi tong hop.
// API key chi luu trong localStorage cua app tren may nguoi dung (khong vao
// file phien, khong gui di noi nao khac ngoai Google API).
export default function GeminiPanel() {
  const dispatch = useDispatch();
  const coordinator = useSelector((s) => s.council.coordinator) || { claimCards: '', formReport: '', synthBrief: '', busy: '', lastError: '' };
  const round = useSelector((s) => s.council.round);
  const mode = useSelector((s) => s.council.topic.mode);
  const saved1 = useSelector((s) => selectRoundSavedCount(s, 1));
  const saved3 = useSelector((s) => selectRoundSavedCount(s, mode === 'fast' ? 1 : 3));
  // V3: vong du dieu kien dieu phoi khi moi bot da Luu hoac Bo qua (>=2 Luu).
  const complete1 = useSelector((s) => selectRoundComplete(s, 1));
  const completeLast = useSelector((s) => selectRoundComplete(s, mode === 'fast' ? 1 : 3));
  const consent = useSelector((s) => s.council.coordinator.consent);
  const consentGiven = consent === true;
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; } });
  // Model da luu tu ban cu (vd gemini-2.5-flash-lite — Google da ngung cap cho
  // nguoi dung moi) tu dong di tru sang model moi tuong ung ngay khi mo panel.
  const [model, setModel] = useState(() => {
    try {
      const resolved = resolveGeminiModel(localStorage.getItem(MODEL_STORAGE) || DEFAULT_GEMINI_MODEL);
      localStorage.setItem(MODEL_STORAGE, resolved);
      return resolved;
    } catch (_) { return DEFAULT_GEMINI_MODEL; }
  });
  const [showKey, setShowKey] = useState(false);
  const [secretaryOn, setSecretaryOn] = useState(() => { try { return localStorage.getItem(SECRETARY_STORAGE) !== 'off'; } catch (_) { return true; } });
  const saveSecretary = (value) => {
    setSecretaryOn(value);
    try { localStorage.setItem(SECRETARY_STORAGE, value ? 'on' : 'off'); } catch (_) { /* bo qua */ }
  };

  const saveKey = (value) => {
    setApiKey(value);
    try { localStorage.setItem(KEY_STORAGE, value.trim()); } catch (_) { /* bo qua */ }
  };
  const saveModel = (value) => {
    setModel(value);
    try { localStorage.setItem(MODEL_STORAGE, value); } catch (_) { /* bo qua */ }
  };
  const payload = { apiKey: apiKey.trim(), model };
  const hasKey = !!apiKey.trim();
  const busy = !!coordinator.busy;

  return (
    <div className="gemini-panel">
      <div className="gemini-head">
        <span className="gemini-title">✨ Điều phối Gemini API</span>
        <span className={`gemini-state ${hasKey ? 'on' : ''}`}>{hasKey ? 'Đã có key' : 'Chưa có key'}</span>
      </div>
      <p className="gemini-note">
        Gemini API là <strong>điều phối viên</strong> (không tranh luận): tóm tắt vòng 1 thành thẻ luận điểm cho vòng 2,
        kiểm tra form đáp án, và chuẩn bị gói tóm tắt trước bước tổng hợp của Muse.
        Chưa có key thì app vẫn chạy như cũ bằng nguyên văn đáp án.
      </p>
      {consent === null && (
        <div className="gemini-consent">
          <div className="gemini-consent-title">⚠ Cảnh báo gửi nội dung lên Gemini API</div>
          <p>
            Các bước điều phối sẽ gửi <strong>chủ đề và các đáp án của phiên</strong> lên Gemini API (gói miễn phí) để
            tóm tắt / kiểm tra form / chuẩn bị gói tổng hợp. Nội dung có thể được Google xử lý theo điều khoản của gói miễn phí.
            API key của bạn <strong>không</strong> bị gửi kèm nội dung và không lưu vào file phiên. Cảnh báo này chỉ hỏi 1 lần mỗi phiên.
          </p>
          <div className="btn-row">
            <button type="button" className="primary" onClick={() => dispatch(geminiConsentSet(true))}>Đồng ý, tiếp tục</button>
            <button type="button" onClick={() => dispatch(geminiConsentSet(false))}>Tắt điều phối phiên này</button>
          </div>
        </div>
      )}
      {consent === false && (
        <div className="gemini-consent off">
          Điều phối Gemini API đang <strong>TẮT</strong> cho phiên này — app chạy thủ công bằng nguyên văn đáp án như cách cũ.
          Muốn bật lại, hãy bắt đầu phiên mới và bấm "Đồng ý" ở cảnh báo.
        </div>
      )}
      <div className="secretary-box">
        <label className="secretary-toggle">
          <input type="checkbox" checked={secretaryOn} onChange={(e) => saveSecretary(e.target.checked)} />
          <span>🧑‍💼 Thư ký tự động</span>
        </label>
        <p className="gemini-hint">
          Bật (mặc định): thư ký tự chạy khi có sự kiện — vòng 1 đủ thì tự tóm tắt thẻ luận điểm,
          mỗi vòng đủ thì tự kiểm tra form, vòng cuối đủ thì tự chuẩn bị gói tổng hợp.
          Vẫn cần có key và bạn đã bấm "Đồng ý" ở cảnh báo trên. Tắt: chỉ chạy khi bạn bấm nút như cũ.
        </p>
        <div className="secretary-status">
          Trạng thái thư ký: {busy
            ? `đang làm — ${BUSY_LABELS[coordinator.busy] || coordinator.busy}…`
            : coordinator.lastAuto
              ? `việc tự động gần nhất: ${coordinator.lastAuto}`
              : 'đang rảnh, chờ sự kiện tiếp theo'}
        </div>
      </div>
      <label className="gemini-label">Gemini API key (lấy miễn phí ở Google AI Studio)
        <div className="gemini-key-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => saveKey(e.target.value)}
            placeholder="Dán API key vào đây (AIza...)"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Ẩn' : 'Hiện'}</button>
        </div>
      </label>
      <label className="gemini-label">Model điều phối
        <select value={model} onChange={(e) => saveModel(e.target.value)}>
          {GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <div className="btn-row">
        <button type="button" disabled={!hasKey || busy} onClick={() => dispatch(geminiTestRequested(payload))}>
          {coordinator.busy === 'test' ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
        </button>
      </div>
      <div className="btn-row">
        <button type="button" className="primary" disabled={!hasKey || busy || !consentGiven || !complete1} onClick={() => dispatch(geminiClaimCardsRequested(payload))}>
          {coordinator.busy === 'claimCards' ? 'Đang tóm tắt…' : '1 · Tóm tắt vòng 1 → thẻ luận điểm'}
        </button>
      </div>
      <p className="gemini-hint">{!consentGiven ? 'Cần bạn xử lý cảnh báo gửi nội dung ở trên trước khi dùng các nút điều phối.' : !complete1 ? `Vòng 1 cần mọi bot đã Lưu hoặc Bỏ qua, tối thiểu 2 đã lưu (hiện đã lưu ${saved1}/4).` : coordinator.claimCards ? `Đã có thẻ luận điểm (${coordinator.claimCards.length} ký tự) — prompt vòng 2 sẽ tự dùng thẻ này.` : 'Đã đủ vòng 1 — bấm để Gemini tóm tắt trước khi sang vòng 2.'}</p>
      <div className="btn-row">
        <button type="button" disabled={!hasKey || busy || !consentGiven} onClick={() => dispatch(geminiFormCheckRequested(payload))}>
          {coordinator.busy === 'formCheck' ? 'Đang kiểm tra…' : `2 · Kiểm tra form vòng ${round}`}
        </button>
        <button type="button" disabled={!hasKey || busy || !consentGiven || !completeLast} onClick={() => dispatch(geminiSynthBriefRequested(payload))}>
          {coordinator.busy === 'synthBrief' ? 'Đang chuẩn bị…' : '3 · Gói tóm tắt trước tổng hợp'}
        </button>
      </div>
      <p className="gemini-hint">Nút 3 cần vòng {mode === 'fast' ? '1 (chế độ nhanh)' : '3'} đủ điều kiện (mọi bot đã Lưu hoặc Bỏ qua, tối thiểu 2 đã lưu); gói tóm tắt sẽ tự kèm vào prompt tổng hợp gửi Muse.</p>
      {coordinator.lastError && <div className="gemini-error">⚠️ {coordinator.lastError}</div>}
      {coordinator.formReport && (
        <details className="gemini-details">
          <summary>Kết quả kiểm tra form gần nhất</summary>
          <pre className="gemini-pre">{coordinator.formReport}</pre>
        </details>
      )}
      {coordinator.claimCards && (
        <details className="gemini-details">
          <summary>Thẻ luận điểm vòng 1 (Gemini tóm tắt)</summary>
          <pre className="gemini-pre">{coordinator.claimCards}</pre>
        </details>
      )}
      {coordinator.synthBrief && (
        <details className="gemini-details">
          <summary>Gói tóm tắt trước tổng hợp</summary>
          <pre className="gemini-pre">{coordinator.synthBrief}</pre>
        </details>
      )}
    </div>
  );
}
