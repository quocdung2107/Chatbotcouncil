import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { GEMINI_MODELS } from '../lib/gemini';
import {
  geminiTestRequested, geminiClaimCardsRequested, geminiFormCheckRequested, geminiSynthBriefRequested,
  selectRoundSavedCount,
} from '../store/councilSlice';

const KEY_STORAGE = 'hoi-dong-gemini-api-key';
const MODEL_STORAGE = 'hoi-dong-gemini-model';

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
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; } });
  const [model, setModel] = useState(() => { try { return localStorage.getItem(MODEL_STORAGE) || 'gemini-2.5-flash-lite'; } catch (_) { return 'gemini-2.5-flash-lite'; } });
  const [showKey, setShowKey] = useState(false);

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
        <button type="button" className="primary" disabled={!hasKey || busy || saved1 < 4} onClick={() => dispatch(geminiClaimCardsRequested(payload))}>
          {coordinator.busy === 'claimCards' ? 'Đang tóm tắt…' : '1 · Tóm tắt vòng 1 → thẻ luận điểm'}
        </button>
      </div>
      <p className="gemini-hint">{saved1 < 4 ? `Cần đủ 4/4 đáp án vòng 1 (hiện ${saved1}/4).` : coordinator.claimCards ? `Đã có thẻ luận điểm (${coordinator.claimCards.length} ký tự) — prompt vòng 2 sẽ tự dùng thẻ này.` : 'Đã đủ vòng 1 — bấm để Gemini tóm tắt trước khi sang vòng 2.'}</p>
      <div className="btn-row">
        <button type="button" disabled={!hasKey || busy} onClick={() => dispatch(geminiFormCheckRequested(payload))}>
          {coordinator.busy === 'formCheck' ? 'Đang kiểm tra…' : `2 · Kiểm tra form vòng ${round}`}
        </button>
        <button type="button" disabled={!hasKey || busy || saved3 < 4} onClick={() => dispatch(geminiSynthBriefRequested(payload))}>
          {coordinator.busy === 'synthBrief' ? 'Đang chuẩn bị…' : '3 · Gói tóm tắt trước tổng hợp'}
        </button>
      </div>
      <p className="gemini-hint">Nút 3 cần đủ 4/4 đáp án {mode === 'fast' ? 'vòng 1 (chế độ nhanh)' : 'vòng 3'}; gói tóm tắt sẽ tự kèm vào prompt tổng hợp gửi Muse.</p>
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
