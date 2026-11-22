import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { topicChanged, startSession, geminiConsentSet, sessionChatSendRequested } from '../store/councilSlice';

const KEY_STORAGE = 'hoi-dong-gemini-api-key';

// TAO PHIEN BANG TRO CHUYEN voi thu ky Gemini (cach chinh o man hinh bat
// dau): nguoi dung chi nhan chu de vao 1 hop chat. Thu ky mo dau bang viec
// mo ta lai dieu no HIEU, ra soat cac diem can co truoc tranh luan (muc
// tieu, boi canh, rang buoc, tieu chi, ket qua mong muon, pham vi, che do)
// va soan san BAN NHAP phien. Nguoi dung cu nhan tiep de sua nhap; khi ung
// thi bam 1 nut "Tao phien voi noi dung nay". Form thu cong day du nam o
// muc thu gon ngay ben duoi. Key chi doc tu localStorage (cung khoa voi
// panel Dieu phoi), khong luu vao state hay file phien.
export default function SessionChat() {
  const dispatch = useDispatch();
  const setupChat = useSelector((s) => s.council.setupChat) || { messages: [], draft: null, busy: false };
  const coordinator = useSelector((s) => s.council.coordinator) || {};
  const consent = coordinator.consent;
  const [apiKey] = useState(() => { try { return (localStorage.getItem(KEY_STORAGE) || '').trim(); } catch (_) { return ''; } });
  const hasKey = !!apiKey;
  const [input, setInput] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [setupChat.messages.length, setupChat.busy]);

  const canSend = hasKey && consent === true && !setupChat.busy && input.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    dispatch(sessionChatSendRequested({ text: input }));
    setInput('');
  };

  const createSession = () => {
    const d = setupChat.draft;
    if (!d || !d.title) return;
    dispatch(topicChanged({ field: 'title', value: d.title }));
    const goalParts = [d.goal, d.openingPrompt ? `--- Prompt mở đầu do thư ký soạn ---\n${d.openingPrompt}` : ''].filter((x) => x && x.trim());
    dispatch(topicChanged({ field: 'goal', value: goalParts.join('\n\n') }));
    if (d.criteria) dispatch(topicChanged({ field: 'criteriaText', value: d.criteria.replace(/^-\s*/gm, '') }));
    dispatch(topicChanged({ field: 'mode', value: d.mode === 'fast' ? 'fast' : 'deep' }));
    dispatch(startSession());
  };

  return (
    <div className="session-chat">
      <div className="secretary-head">
        <span className="secretary-title">🧑‍💼 Tạo phiên bằng trò chuyện với thư ký</span>
        <span className={`gemini-state ${hasKey ? 'on' : ''}`}>{hasKey ? 'Đã có key' : 'Chưa có key'}</span>
      </div>

      {consent === null && (
        <div className="gemini-consent">
          <div className="gemini-consent-title">⚠ Cảnh báo gửi nội dung lên Gemini API</div>
          <p>
            Để thư ký hiểu chủ đề và soạn phiên, các tin nhắn bạn gõ ở hộp chat này sẽ được gửi lên
            Gemini API (gói miễn phí). Đồng ý ở đây cũng là đồng ý cho các việc điều phối trong phiên
            (chỉ hỏi 1 lần mỗi phiên, và được giữ khi phiên bắt đầu). API key không bị gửi kèm nội dung
            và không lưu vào file phiên.
          </p>
          <div className="btn-row">
            <button type="button" className="primary" onClick={() => dispatch(geminiConsentSet(true))}>Đồng ý, tiếp tục</button>
            <button type="button" onClick={() => dispatch(geminiConsentSet(false))}>Tắt điều phối phiên này</button>
          </div>
        </div>
      )}
      {consent === false && (
        <div className="gemini-consent off">
          Điều phối Gemini API đang <strong>TẮT</strong> — thư ký không trò chuyện được. Hãy dùng cách
          tạo phiên thủ công ở mục bên dưới, hoặc đóng và mở lại app rồi chọn "Đồng ý".
        </div>
      )}
      {!hasKey && (
        <p className="gemini-hint">Chưa có Gemini API key — nhập key ở panel Điều phối, hoặc dùng cách thủ công bên dưới.</p>
      )}

      <div className="chat-messages" ref={listRef}>
        {setupChat.messages.length === 0 && (
          <div className="chat-msg secretary">
            Xin chào, tôi là thư ký của hội đồng. Bạn cứ nhắn chủ đề muốn bàn vào ô dưới đây —
            tôi sẽ mô tả lại điều tôi hiểu, hỏi thêm những điểm còn thiếu, và soạn sẵn phiên cho bạn.
          </div>
        )}
        {setupChat.messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role === 'user' ? 'user' : 'secretary'}`}>
            {msg.text}
          </div>
        ))}
        {setupChat.busy && <div className="chat-msg secretary muted">Thư ký đang suy nghĩ…</div>}
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Nhắn chủ đề của bạn cho thư ký…"
          disabled={!hasKey || consent !== true || setupChat.busy}
        />
        <button type="button" className="primary" disabled={!canSend} onClick={send}>Gửi</button>
      </div>
      <p className="gemini-hint">Thư ký sẽ tự rà soát: mục tiêu · bối cảnh · ràng buộc · tiêu chí · kết quả mong muốn · phạm vi · chế độ.</p>
      {coordinator.lastError && <div className="gemini-error">⚠️ {coordinator.lastError}</div>}

      {setupChat.draft && setupChat.draft.title && (
        <div className="chat-draft-bar">
          <div className="chat-draft-summary">
            <strong>Bản nháp phiên:</strong> {setupChat.draft.title}
            <span className="muted"> — {setupChat.draft.mode === 'fast' ? 'Nhanh (1 lượt)' : 'Sâu (3 vòng)'}. Bạn có thể nhắn tiếp để sửa, hoặc tạo phiên ngay:</span>
          </div>
          <button type="button" className="primary big" onClick={createSession}>✅ Tạo phiên với nội dung này</button>
        </div>
      )}
    </div>
  );
}
