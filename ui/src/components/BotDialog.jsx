import React, { useEffect, useState } from 'react';
import { STATUS } from '../store/councilSlice';
import { BotAvatar } from './BotCard';
import { getCustomSelector } from '../lib/answerSettings';
import { confidenceReasons, confidenceBand } from '../lib/confidence';

// VUNG THAO TAC GHIM cua bot dang chon (ban lam lai UI) — nam co dinh ben
// duoi danh sach the bot trong tab Thao tac, co cuon rieng; doi bot chi doi
// noi dung vung nay, khong con dialog bung xuong day cac the khac nhu ban cu.
//
// LUONG 3 BUOC MEM:
//   ① Chuan bi cau hoi -> ② Gui va cho -> ③ Lay ve, kiem tra va luu
// Chi BUOC HIEN TAI duoc mo rong va co dung 1 nut CHINH (xanh duong dam).
// Buoc da xong thu gon thanh 1 dong co dau ✓. Buoc chua toi chi hien tieu de
// + "chua toi luot", lam mo nhung KHONG khoa — nguoi dung van bam vao tieu
// de de mo ra neu trang thai app lech voi thao tac that tren trang web.
// Nut phu it dung gom vao menu "⋯ Khac": Mo phien chat moi, Tai lai trang
// bot, Cai dat nang cao (cai dat selector tuy chinh nam trong do).
// "Dan tay (du phong)" va "Bo qua bot nay o vong nay" LUON hien o buoc ③;
// khi lay dap an bi loi, "Dan tay" tro thanh nut chinh cua buoc ③.
const STEP_TITLES = {
  1: '① Chuẩn bị câu hỏi',
  2: '② Gửi và chờ',
  3: '③ Lấy về, kiểm tra và lưu',
};

function StepBlock({ no, state, onHeadClick, children }) {
  return (
    <div className={`step-block step-${state}`}>
      <button type="button" className="step-block-head" onClick={onHeadClick} title="Bấm để mở bước này">
        <span>{STEP_TITLES[no]}</span>
        {state === 'done' && <span className="step-state">✓ Xong</span>}
        {state === 'future' && <span className="step-state">chưa tới lượt</span>}
      </button>
      {state === 'current' && <div className="step-block-body">{children}</div>}
    </div>
  );
}

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
  const [showMore, setShowMore] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [openStep, setOpenStep] = useState(null); // null = theo trang thai that
  const confidence = cell.confidence != null ? cell.confidence : null;
  const band = confidenceBand(confidence);
  const saveBlockedByConfidence = confidence != null && confidence < 60;
  const lowList = lowCandidates || [];
  const hasError = !!cell.error;
  // Moi lan doi bot, nap selector tuy chinh (neu co) cua bot do vao o nhap.
  useEffect(() => { setSelectorDraft(getCustomSelector(bot.id)); setShowSettings(false); setShowMore(false); setOpenStep(null); }, [bot.id]);
  const customSelector = getCustomSelector(bot.id);
  const list = candidates || [];

  // Buoc hien tai suy tu trang thai that cua o dap an (khong doi logic V3):
  // idle -> ① | prompt_ready (da dan/copy prompt) -> ② | sent -> ③ |
  // fetched -> ③ (dang duyet) | saved/skipped -> ca 3 buoc deu xong.
  const derivedStep = cell.status === STATUS.saved || cell.status === STATUS.skipped
    ? 4
    : cell.status === STATUS.sent || cell.status === STATUS.fetched
      ? 3
      : cell.status === STATUS.prompt_ready
        ? 2
        : 1;
  const currentStep = openStep != null ? openStep : derivedStep;
  const stepState = (no) => (no === currentStep ? 'current' : no < derivedStep || derivedStep === 4 ? 'done' : 'future');

  return (
    <div className="bot-dialog in-pinned" role="region" aria-label={`Thao tác với ${bot.name}`}>
      <div className="bot-dialog-head">
        <BotAvatar bot={bot} size={28} />
        <span className="bot-dialog-title">{synth ? 'Tổng hợp — Muse kết luận' : `[Vòng ${round} — ${bot.name}]`}</span>
        <div className="more-menu">
          <button type="button" className="more-btn" onClick={() => setShowMore((v) => !v)} title="Thao tác ít dùng">⋯ Khác</button>
          {showMore && (
            <div className="more-popover">
              {browserMode ? (
                <a className="open-link" href={bot.url} target="_blank" rel="noreferrer">Mở tab {bot.name} ↗</a>
              ) : (
                <>
                  <button type="button" onClick={onNewSession} title="Nạp lại trang gốc của chatbot để bắt đầu chat mới">Mở phiên chat mới</button>
                  <button type="button" onClick={onReload} title="Tải lại trang chatbot">Tải lại trang bot</button>
                  <button type="button" onClick={() => { setShowSettings((v) => !v); }} title="Cài đặt cách lấy đáp án từ trang">
                    Cài đặt nâng cao {customSelector ? '(đang dùng selector TÙY CHỈNH)' : ''}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <button type="button" className="dialog-close" onClick={onClose} title="Bỏ chọn bot này">✕</button>
      </div>

      {integrityError && integrityError.botId === bot.id && (
        <div className="integrity-error">
          ⚠ Prompt vòng {integrityError.round} của {bot.name} đã bị CHẶN vì thiếu: {integrityError.missing.join('; ')}.
          Hãy kiểm tra đáp án vòng trước / thẻ luận điểm rồi bấm dán lại.
        </div>
      )}

      {cell.status === STATUS.skipped && (
        <div className="skip-note">⏭ {bot.name} đã được BỎ QUA ở vòng {round}{cell.skipped?.reason ? ` — lý do: ${cell.skipped.reason}` : ''}. Vòng vẫn đóng được nếu các bot còn lại đã lưu (tối thiểu 2 đáp án đã lưu).</div>
      )}

      {/* ===== BUOC 1: Chuan bi cau hoi ===== */}
      <StepBlock no={1} state={stepState(1)} onHeadClick={() => setOpenStep(1)}>
        {browserMode ? (
          <>
            <div className="btn-row">
              <button type="button" className="primary" onClick={onCopy}>{synth ? 'Sao chép lời nhắc TỔNG HỢP' : 'Sao chép lời nhắc'}</button>
              <a className="open-link" href={bot.url} target="_blank" rel="noreferrer">Mở tab {bot.name} ↗</a>
            </div>
            <p className="step-hint">Sao chép lời nhắc, sang tab {bot.name}, dán (Ctrl+V) vào ô chat rồi tự bấm Gửi.</p>
          </>
        ) : (
          <>
            <div className="btn-row">
              <button type="button" className="primary" onClick={onFillComposer} title="App tự điền lời nhắc vào đúng ô nhập của chatbot trong tab — bạn đọc lại trong trang rồi TỰ bấm Gửi">
                Dán lời nhắc vào trang
              </button>
              <button type="button" onClick={onCopy} title="Chỉ sao chép lời nhắc vào clipboard, không dán vào trang">{synth ? 'Sao chép lời nhắc TỔNG HỢP' : 'Sao chép lời nhắc'}</button>
            </div>
            <p className="step-hint">App chỉ điền lời nhắc vào ô nhập — bạn đọc lại trong trang rồi <strong>tự bấm Gửi</strong>.</p>
          </>
        )}
      </StepBlock>

      {/* ===== BUOC 2: Gui va cho ===== */}
      <StepBlock no={2} state={stepState(2)} onHeadClick={() => setOpenStep(2)}>
        <p className="step-hint">Đã bấm Gửi trong trang {bot.name} và bot bắt đầu trả lời? Bấm nút này để app chuyển sang bước lấy đáp án.</p>
        <div className="btn-row">
          <button type="button" className="primary" onClick={onSent} disabled={cell.status === STATUS.saved}>Tôi đã gửi xong</button>
        </div>
      </StepBlock>

      {/* ===== BUOC 3: Lay ve, kiem tra va luu ===== */}
      <StepBlock no={3} state={stepState(3)} onHeadClick={() => setOpenStep(3)}>
        {hasError && (
          <div className="integrity-error">⛔ Lỗi lấy đáp án: {cell.error} Hãy thử lại, hoặc dùng nút “Dán tay (dự phòng)” ở dưới.</div>
        )}
        <div className="btn-row">
          {browserMode ? (
            <button type="button" className="primary" onClick={onPaste}>Dán câu trả lời về</button>
          ) : (
            <>
              <button
                type="button"
                className={hasError || cell.status === STATUS.fetched ? '' : 'primary'}
                onClick={onFetch}
                title="App đọc khối đáp án mới nhất ngay trong tab và điền vào ô dưới — bạn duyệt rồi mới Lưu"
              >
                Lấy câu trả lời về
              </button>
              <button
                type="button"
                className={hasError ? 'primary' : ''}
                onClick={onPaste}
                title="Cách cũ, dự phòng khi nút lấy từ tab không đọc được trang"
              >
                Dán tay (dự phòng)
              </button>
            </>
          )}
          {cell.status === STATUS.fetched && <span className="char-count">Đáp án đã về ô dưới — đọc lại rồi bấm Lưu.</span>}
        </div>

        {confidence != null && (
          <div className={`confidence-box band-${band}`}>
            <div className="confidence-head">
              <span>Điểm tin cậy trích xuất: <strong>{confidence}/100</strong></span>
              <span className="confidence-note">Điểm tin cậy của phép trích xuất, không phải xác suất đúng tuyệt đối.</span>
            </div>
            <div className="confidence-bar"><span style={{ width: `${confidence}%` }} /></div>
            {band === 'medium' && <div className="confidence-warn">Mức trung bình — hãy đọc kỹ đáp án trước khi Lưu.</div>}
            {band === 'low' && <div className="confidence-warn">Điểm quá thấp (dưới 60) — nút Lưu đang bị KHÓA. Hãy chọn lại vùng đáp án đúng ở danh sách dưới đây hoặc trong "Cài đặt nâng cao" (menu ⋯ Khác), rồi bấm "Lấy câu trả lời về" lại.</div>}
            {confidenceReasons(cell.breakdown).length > 0 && (
              <ul className="confidence-reasons">
                {confidenceReasons(cell.breakdown).map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
        )}
        <textarea
          className="answer-box"
          placeholder={synth ? 'Kết luận tổng hợp của Muse sẽ hiện ở đây sau khi bấm "Lấy câu trả lời về" — đọc lại, sửa nếu cần rồi mới bấm Lưu.' : 'Đáp án của bot sẽ hiện ở đây sau khi bấm "Lấy câu trả lời về" — đọc lại, sửa nếu cần rồi mới bấm Lưu.'}
          value={cell.answer}
          onChange={(e) => onEdit(e.target.value)}
          rows={7}
        />
        {lowList.length > 0 && (
          <div className="candidate-list low-candidates">
            <div className="settings-note">Các vùng ứng viên vừa quét được — bấm 1 vùng để đặt làm selector rồi bấm "Lấy câu trả lời về" lại:</div>
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
          <button
            type="button"
            className={cell.status === STATUS.fetched && !hasError ? 'primary' : ''}
            onClick={onSave}
            disabled={!cell.answer.trim() || saveBlockedByConfidence}
          >
            Lưu câu trả lời này
          </button>
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
      </StepBlock>

      {/* ===== Cai dat nang cao (selector tuy chinh) — mo tu menu ⋯ Khac ===== */}
      {!browserMode && showSettings && (
        <div className="extract-settings">
          <div className="settings-title">⚙ Cài đặt nâng cao — cách lấy đáp án của {bot.name} {customSelector ? '(đang dùng selector TÙY CHỈNH)' : '(đang dùng mặc định)'}</div>
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
        </div>
      )}
    </div>
  );
}
