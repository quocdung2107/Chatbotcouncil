import React from 'react';
import { STATUS } from '../store/councilSlice';

export const STATUS_LABEL = {
  [STATUS.idle]: 'Chưa làm',
  [STATUS.prompt_ready]: 'Đã copy prompt',
  [STATUS.sent]: 'Đã gửi — chờ đáp án',
  [STATUS.saved]: 'Đã lưu đáp án',
};

// The trang thai + cac nut thao tac cua 1 bot trong vong hien tai.
// Quy trinh ban tu dong: Copy prompt -> (dan + Gui bang tay trong tab) ->
// "Da gui" -> copy dap an trong tab -> "Dan dap an ve".
export default function BotCard({ bot, cell, isActive, onSelect, onCopy, onSent, onPaste, onSave, onEdit, onReload, onNewSession, browserMode, synth }) {
  return (
    <div className={`bot-card ${isActive ? 'active' : ''}`} onClick={onSelect}>
      <div className="bot-card-head">
        <span className="bot-dot" style={{ background: bot.color }} />
        <span className="bot-name">{bot.name}</span>
        <span className={`status status-${cell.status}`}>{STATUS_LABEL[cell.status]}</span>
      </div>

      {isActive && (
        <div className="bot-card-body" onClick={(e) => e.stopPropagation()}>
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
            <button type="button" className="primary" onClick={onCopy}>{synth ? '1 · Copy prompt TỔNG HỢP' : '1 · Copy prompt vòng này'}</button>
          </div>
          <div className="btn-row">
            <button type="button" onClick={onSent} disabled={cell.status === STATUS.saved}>2 · Tôi đã dán + bấm Gửi</button>
            <button type="button" className="primary" onClick={onPaste}>3 · Dán đáp án về</button>
          </div>
          <textarea
            className="answer-box"
            placeholder={synth ? 'Kết luận tổng hợp của Muse sẽ hiện ở đây sau khi dán về — bạn cũng có thể dán/sửa tay rồi bấm Lưu.' : 'Đáp án của bot sẽ hiện ở đây sau khi dán về — bạn cũng có thể dán/sửa tay rồi bấm Lưu.'}
            value={cell.answer}
            onChange={(e) => onEdit(e.target.value)}
            rows={7}
          />
          <div className="btn-row">
            <button type="button" onClick={onSave} disabled={!cell.answer.trim()}>Lưu đáp án</button>
            <span className="char-count">{cell.answer.length} ký tự</span>
          </div>
        </div>
      )}
    </div>
  );
}
