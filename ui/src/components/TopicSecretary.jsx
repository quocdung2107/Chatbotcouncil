import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_GEMINI_MODEL } from '../lib/gemini';
import { topicChanged, geminiConsentSet, geminiTopicAnalysisRequested } from '../store/councilSlice';

const KEY_STORAGE = 'hoi-dong-gemini-api-key';
const MODEL_STORAGE = 'hoi-dong-gemini-model';

// THU KY CHU DE o man hinh bat dau (Gemini API, Phase B): nguoi dung go chu
// de tho -> thu ky phan tich, hieu chu de va SOAN SAN tieu de / muc tieu /
// tieu chi / cau hoi lam ro / prompt mo phien / che do de xuat. Moi phan
// chi duoc ap dung khi nguoi dung bam nut "Dung ..." cua chinh phan do —
// thu ky soan nhap, nguoi dung duyet. Key chi doc tu localStorage (cung
// khoa voi panel Dieu phoi), khong luu vao state hay file phien.
export default function TopicSecretary() {
  const dispatch = useDispatch();
  const topic = useSelector((s) => s.council.topic);
  const coordinator = useSelector((s) => s.council.coordinator) || {};
  const consent = coordinator.consent;
  const draft = coordinator.topicDraft;
  const busy = coordinator.busy === 'topicAnalysis';
  const [apiKey] = useState(() => { try { return (localStorage.getItem(KEY_STORAGE) || '').trim(); } catch (_) { return ''; } });
  const [model] = useState(() => { try { return localStorage.getItem(MODEL_STORAGE) || DEFAULT_GEMINI_MODEL; } catch (_) { return DEFAULT_GEMINI_MODEL; } });
  const hasKey = !!apiKey;

  const analyse = () => dispatch(geminiTopicAnalysisRequested({
    apiKey, model, topic: { title: topic.title, goal: topic.goal },
  }));

  return (
    <div className="topic-secretary">
      <div className="secretary-head">
        <span className="secretary-title">🧑‍💼 Thư ký Gemini — phân tích chủ đề</span>
        <span className={`gemini-state ${hasKey ? 'on' : ''}`}>{hasKey ? 'Đã có key' : 'Chưa có key'}</span>
      </div>
      <p className="gemini-note">
        Nhập chủ đề (và mục tiêu nếu có) ở form trên, rồi bấm nút dưới đây: thư ký Gemini API sẽ
        hiểu chủ đề và soạn sẵn tiêu đề gọn, mục tiêu/bối cảnh, tiêu chí chấm, câu hỏi làm rõ và
        cả prompt mở phiên. Bạn duyệt từng phần, phần nào ưng mới bấm "Dùng ..." để điền vào form.
      </p>
      {consent === null && (
        <div className="gemini-consent">
          <div className="gemini-consent-title">⚠ Cảnh báo gửi nội dung lên Gemini API</div>
          <p>
            Thư ký sẽ gửi <strong>chủ đề bạn vừa nhập</strong> lên Gemini API (gói miễn phí) để phân tích.
            Đồng ý ở đây cũng là đồng ý cho các việc điều phối trong phiên (chỉ hỏi 1 lần mỗi phiên,
            và sẽ được giữ khi bạn bấm "Bắt đầu phiên"). API key không bị gửi kèm nội dung và không lưu vào file phiên.
          </p>
          <div className="btn-row">
            <button type="button" className="primary" onClick={() => dispatch(geminiConsentSet(true))}>Đồng ý, tiếp tục</button>
            <button type="button" onClick={() => dispatch(geminiConsentSet(false))}>Tắt điều phối phiên này</button>
          </div>
        </div>
      )}
      {consent === false && (
        <div className="gemini-consent off">
          Điều phối Gemini API đang <strong>TẮT</strong> — thư ký không phân tích được. Muốn dùng thư ký,
          hãy đóng và mở lại app, rồi chọn "Đồng ý" ở hộp cảnh báo.
        </div>
      )}
      <div className="btn-row">
        <button type="button" className="primary" disabled={!hasKey || busy || consent !== true || !topic.title.trim()} onClick={analyse}>
          {busy ? 'Thư ký đang phân tích…' : 'Phân tích chủ đề của tôi'}
        </button>
      </div>
      {!hasKey && <p className="gemini-hint">Chưa có Gemini API key — hãy nhập key ở panel "Điều phối Gemini API" phía dưới trước, thư ký sẽ dùng chung key đó.</p>}
      {hasKey && consent === true && !topic.title.trim() && <p className="gemini-hint">Hãy nhập chủ đề ở ô "Chủ đề" phía trên trước.</p>}
      {coordinator.lastError && <div className="gemini-error">⚠️ {coordinator.lastError}</div>}

      {draft && (
        <div className="secretary-result">
          {draft.title && (
            <div className="secretary-section">
              <div className="secretary-section-title">Tiêu đề đề xuất</div>
              <p>{draft.title}</p>
              <button type="button" onClick={() => dispatch(topicChanged({ field: 'title', value: draft.title }))}>Dùng tiêu đề này</button>
            </div>
          )}
          {draft.goal && (
            <div className="secretary-section">
              <div className="secretary-section-title">Mục tiêu và bối cảnh</div>
              <p className="secretary-pre">{draft.goal}</p>
              <button type="button" onClick={() => dispatch(topicChanged({ field: 'goal', value: draft.goal }))}>Dùng mục tiêu/bối cảnh này</button>
            </div>
          )}
          {draft.criteria && (
            <div className="secretary-section">
              <div className="secretary-section-title">Tiêu chí chấm</div>
              <p className="secretary-pre">{draft.criteria}</p>
              <button type="button" onClick={() => dispatch(topicChanged({ field: 'criteriaText', value: draft.criteria.replace(/^-\s*/gm, '') }))}>Dùng tiêu chí này</button>
            </div>
          )}
          {Array.isArray(draft.questions) && draft.questions.length > 0 && (
            <div className="secretary-section">
              <div className="secretary-section-title">Câu hỏi làm rõ — hãy đọc và cân nhắc trả lời vào ô Mục tiêu/bối cảnh trước khi bắt đầu</div>
              <ul className="secretary-questions">
                {draft.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}
          {draft.openingPrompt && (
            <div className="secretary-section">
              <div className="secretary-section-title">Prompt mở phiên (thư ký soạn sẵn)</div>
              <p className="secretary-pre">{draft.openingPrompt}</p>
              <button type="button" onClick={() => dispatch(topicChanged({ field: 'goal', value: draft.openingPrompt }))}>Dùng prompt mở phiên làm bối cảnh</button>
            </div>
          )}
          <div className="secretary-section">
            <div className="secretary-section-title">Chế độ đề xuất</div>
            <p>{draft.mode === 'fast' ? 'Nhanh — 1 lượt nối tiếp' : 'Sâu — 3 vòng đầy đủ'}{draft.modeReason ? ` · ${draft.modeReason}` : ''}</p>
            <button type="button" onClick={() => dispatch(topicChanged({ field: 'mode', value: draft.mode }))}>Dùng chế độ này</button>
          </div>
        </div>
      )}
    </div>
  );
}
