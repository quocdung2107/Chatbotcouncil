import React, { useEffect, useState } from 'react';
import { STATUS } from '../store/councilSlice';
import { BotAvatar } from './BotCard';
import { getCustomSelector } from '../lib/answerSettings';
import { confidenceReasons, confidenceBand } from '../lib/confidence';

// DIALOG THAO TAC cua bot dang duoc chon — mo ngay duoi the tab cua bot do
// trong cot trai (vung tab ben phai la trang web rieng cua Electron nen
// khong de dialog len tren duoc). Gom tat ca nut cua bot:
//  1a Copy prompt (clipboard) | 1b Dan prompt thang vao o nhap cua chatbot
//     (app chi dien vao o nhap — nguoi dung doc lai trong trang roi TU Gui)
//  2 Toi da Gui | 3 Lay dap an tu tab | Dan tu clipboard (du phong)
//  O dap an de duyet/sua -> Luu dap an
//  + muc "Cai dat lay dap an": selector dang dung, quet vung ung vien tu
//    trang that, chon vung truc tiep tren trang, tu go selector, khoi phuc
//    mac dinh. Selector tuy chinh luu tren may nguoi dung, thay mac dinh.
export default function BotDialog({
  bot, cell, synth, browserMode,
  onCopy, onFillComposer, onSent, onFetch, onPaste, onSave, onEdit,
  onReload, onNewSession,
  candidates, picking,
  onScan, onStartPick, onApplySelector, onClearSelector, onClose,
  // V3:
  round, onSkip, integrityError, lowCandidates, fileExists,
}) {
  const [selectorDraft, setSelectorDraft] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const confidence = cell.confidence != null ? cell.confidence : null;
  const band = confidenceBand(confidence);
  const saveBlockedByConfidence = confidence != null && confidence < 60;
  const lowList = lowCandidates || [];
  // Moi lan doi bot, nap selector tuy chinh (neu co) cua bot do vao o nhap.
  useEffect(() => { setSelectorDraft(getCustomSelector(bot.id)); setShowSettings(false); }, [bot.id]);
  const customSelector = getCustomSelector(bot.id);
  const list = candidates || [];

  return (
    <div className="bot-dialog" role="dialog" aria-label={`Thao tác với ${bot.name}`}>
      <div className="bot-dialog-head">
        <BotAvatar bot={bot} size={28} />
        <span className="bot-dialog-title">{synth ? 'Tổng hợp cuối cùng' : `[Vòng ${round} — ${bot.name}]`}</span>
        <button type="button" className="dialog-close" onClick={onClose} title="Đóng dialog">✕</button>
      </div>

      {browserMode ? (
        <div className="btn-row">
          <a className="open-link" href={bot.url} target="_blank" rel="noreferrer">Mở tab {bot.name} ↗</a>
        </div>
      ) : (
        <div className="btn-row">
          <button type="button" onClick={onNewSession} title="Nạp lại trang gốc của chatbot để bắt đầu chat mới">↺ Session mới</button>
          <button type="button" onClick={onReload} title="Tải lại trang chatbot">⟳ Tải lại</button>
        </div>
      )}

      <div className="btn-row">
        <button type="button" onClick={onCopy}>{synth ? '1a · Copy prompt TỔNG HỢP' : '1a · Copy prompt vòng này'}</button>
        {!browserMode && (
          <button type="button" className="primary" onClick={onFillComposer} title="App tự điền prompt vào đúng ô nhập của chatbot trong tab — bạn đọc lại trong trang rồi TỰ bấm Gửi">
            {synth ? '1b · Dán prompt vào ô nhập Muse' : '1b · Dán prompt vào ô nhập của chatbot'}
          </button>
        )}
      </div>
      <div className="btn-row">
        <button type="button" onClick={onSent} disabled={cell.status === STATUS.saved}>2 · Tôi đã bấm Gửi trong trang</button>
        {browserMode ? (
          <button type="button" className="primary" onClick={onPaste}>3 · Dán đáp án về</button>
        ) : (
          <button type="button" className="primary" onClick={onFetch} title="App đọc khối đáp án mới nhất ngay trong tab và điền vào ô dưới — bạn duyệt rồi mới Lưu">3 · ⬇ Lấy đáp án từ tab</button>
        )}
      </div>
      {!browserMode && (
        <div className="btn-row">
          <button type="button" onClick={onPaste} title="Cách cũ, dự phòng khi nút lấy từ tab không đọc được trang">Dán từ clipboard (dự phòng)</button>
          {cell.status === STATUS.fetched && <span className="char-count">Đáp án đã về ô dưới — đọc lại rồi bấm Lưu.</span>}
        </div>
      )}

      {integrityError && integrityError.botId === bot.id && (
        <div className="integrity-error">
          ⚠ Prompt vòng {integrityError.round} của {bot.name} đã bị CHẶN vì thiếu: {integrityError.missing.join('; ')}.
          Hãy kiểm tra đáp án vòng trước / thẻ luận điểm rồi bấm dán lại.
        </div>
      )}

      {cell.status === STATUS.skipped && (
        <div className="skip-note">⏭ {bot.name} đã được BỎ QUA ở vòng {round}{cell.skipped?.reason ? ` — lý do: ${cell.skipped.reason}` : ''}. Vòng vẫn đóng được nếu các bot còn lại đã lưu (tối thiểu 2 đáp án đã lưu).</div>
      )}

      <textarea
        className="answer-box"
        placeholder={synth ? 'Kết luận tổng hợp của Muse sẽ hiện ở đây sau khi bấm "Lấy đáp án từ tab" — đọc lại, sửa nếu cần rồi mới bấm Lưu.' : 'Đáp án của bot sẽ hiện ở đây sau khi bấm "Lấy đáp án từ tab" — đọc lại, sửa nếu cần rồi mới bấm Lưu.'}
        value={cell.answer}
        onChange={(e) => onEdit(e.target.value)}
        rows={7}
      />
      {confidence != null && (
        <div className={`confidence-box band-${band}`}>
          <div className="confidence-head">
            <span>Điểm tin cậy trích xuất: <strong>{confidence}/100</strong></span>
            <span className="confidence-note">Điểm tin cậy của phép trích xuất, không phải xác suất đúng tuyệt đối.</span>
          </div>
          <div className="confidence-bar"><span style={{ width: `${confidence}%` }} /></div>
          {band === 'medium' && <div className="confidence-warn">Mức trung bình — hãy đọc kỹ đáp án trước khi Lưu.</div>}
          {band === 'low' && <div className="confidence-warn">Điểm quá thấp (dưới 60) — nút Lưu đang bị KHÓA. Hãy chọn lại vùng đáp án đúng ở danh sách dưới đây hoặc trong "Cài đặt lấy đáp án", rồi bấm "Lấy đáp án từ tab" lại.</div>}
          {confidenceReasons(cell.breakdown).length > 0 && (
            <ul className="confidence-reasons">
              {confidenceReasons(cell.breakdown).map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
      {lowList.length > 0 && (
        <div className="candidate-list low-candidates">
          <div className="settings-note">Các vùng ứng viên vừa quét được — bấm 1 vùng để đặt làm selector rồi bấm "Lấy đáp án từ tab" lại:</div>
          {lowList.map((c, i) => (
            <button
              type="button"
              key={`low-${c.selector}-${i}`}
              className="candidate-item"
              onClick={() => onApplySelector(c.selector, 'chọn lại sau khi điểm tin cậy thấp', { length: c.length || 0, head80: (c.preview || '').slice(0, 80) })}
            >
              <span className="candidate-meta">{c.length} ký tự</span>
              <span className="candidate-preview">{c.preview}</span>
            </button>
          ))}
        </div>
      )}
      <div className="btn-row">
        <button type="button" onClick={onSave} disabled={!cell.answer.trim() || saveBlockedByConfidence}>Lưu đáp án</button>
        <span className="char-count">{cell.answer.length} ký tự</span>
        {fileExists && <span className="file-exists-warn" title="Lưu sẽ ghi đè file đáp án đã có của vòng này">⚠ File đích đã tồn tại — Lưu sẽ ghi đè</span>}
      </div>
      {!synth && cell.status !== STATUS.skipped && cell.status !== STATUS.saved && onSkip && (
        <div className="skip-zone">
          {!showSkip ? (
            <button type="button" className="skip-btn" onClick={() => setShowSkip(true)} title="Bỏ qua bot này ở vòng này — vòng vẫn chạy tiếp với các bot còn lại">
              ⏭ Bỏ qua bot này ở vòng này
            </button>
          ) : (
            <div className="skip-confirm">
              <div>Bỏ qua {bot.name} ở vòng {round}? Đáp án vòng này của bot sẽ trống và kết luận tổng hợp sẽ ghi rõ phiên thiếu bot này.</div>
              <input
                type="text"
                className="selector-input"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                placeholder="Lý do (tuỳ chọn) — ví dụ: bot lỗi đăng nhập"
              />
              <div className="btn-row">
                <button type="button" className="primary" onClick={() => { onSkip(skipReason); setShowSkip(false); }}>Xác nhận bỏ qua</button>
                <button type="button" onClick={() => setShowSkip(false)}>Huỷ</button>
              </div>
            </div>
          )}
        </div>
      )}

      {!browserMode && (
        <div className="extract-settings">
          <button type="button" className="settings-toggle" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? '▾' : '▸'} Cài đặt lấy đáp án {customSelector ? '(đang dùng selector TÙY CHỈNH)' : '(đang dùng mặc định)'}
          </button>
          {showSettings && (
            <div className="settings-body">
              <p className="settings-note">
                Nếu nút lấy đáp án không đọc được trang của {bot.name}, hãy tự chọn vùng đáp án từ CHÍNH trang thật —
                selector bạn chọn sẽ thay mặc định cho bot này (lưu trên máy của bạn).
              </p>
              <div className="btn-row">
                <button type="button" onClick={onScan} title="Đọc trang thật và liệt kê các khối nội dung có thể là đáp án, kèm đoạn xem trước">Quét các vùng ứng viên từ trang</button>
                <button type="button" onClick={onStartPick} disabled={picking === bot.id} title="Bật chế độ chọn: sang tab chatbot, di chuột tới khối đáp án (viền cam) rồi bấm vào nó">
                  {picking === bot.id ? 'Đang chờ bạn bấm vào khối đáp án trong tab…' : 'Chọn vùng trực tiếp trên trang'}
                </button>
              </div>
              {list.length > 0 && (
                <div className="candidate-list">
                  {list.map((c, i) => (
                    <button
                      type="button"
                      key={`${c.selector}-${i}`}
                      className="candidate-item"
                      onClick={() => { onApplySelector(c.selector, 'chọn từ danh sách quét trang thật'); setSelectorDraft(c.selector); }}
                      title={`Dùng vùng này làm selector lấy đáp án cho ${bot.name}`}
                    >
                      <span className="candidate-meta">{c.length} ký tự</span>
                      <span className="candidate-preview">{c.preview}</span>
                    </button>
                  ))}
                </div>
              )}
              <label className="settings-label">
                Selector đang dùng cho {bot.name} {customSelector ? '(tùy chỉnh)' : '(đang trống = dùng mặc định có sẵn)'}:
                <input
                  type="text"
                  className="selector-input"
                  value={selectorDraft}
                  onChange={(e) => setSelectorDraft(e.target.value)}
                  placeholder="Ví dụ: [data-testid=&quot;ai-message&quot;] — hoặc để trống dùng mặc định"
                  spellCheck={false}
                />
              </label>
              <div className="btn-row">
                <button type="button" onClick={() => onApplySelector(selectorDraft, 'tự nhập')} disabled={!selectorDraft.trim()}>Lưu selector này</button>
                <button type="button" onClick={() => { onClearSelector(); setSelectorDraft(''); }} disabled={!customSelector}>Khôi phục mặc định</button>
                <button type="button" onClick={onFetch}>Thử lấy đáp án ngay</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
