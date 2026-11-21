import React, { useState } from 'react';
import { STATUS } from '../store/councilSlice';

export const STATUS_LABEL = {
  [STATUS.idle]: 'Chưa làm',
  [STATUS.prompt_ready]: 'Đã có prompt',
  [STATUS.sent]: 'Đã gửi — chờ đáp án',
  [STATUS.fetched]: 'Đã lấy về — chờ bạn duyệt',
  [STATUS.saved]: 'Đã lưu đáp án',
  [STATUS.skipped]: 'Đã bỏ qua vòng này',
};

// Avatar rieng cho tung chatbot: vong tron gradient + chu viet tat, de nhin
// vao la nhan ra ngay tab nao (thay cho cham mau don dieu truoc day).
export function BotAvatar({ bot, size = 34 }) {
  return (
    <span
      className="bot-avatar"
      style={{ background: bot.gradient || bot.color, width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
      aria-hidden="true"
    >
      {bot.initials || bot.name.slice(0, 2)}
    </span>
  );
}

// The TAB cua 1 bot: gon (avatar + ten + trang thai). Bam vao the de chon
// tab — DIALOG thao tac (BotDialog) se mo ngay duoi the voi day du nut:
// dan prompt vao o nhap, lay dap an, cai dat lay dap an... Keo-tha file
// dap an len the van dung duoc nhu cu.
export default function BotCard({ bot, cell, isActive, onSelect, onDropFile }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={`bot-card ${isActive ? 'active' : ''} ${dragOver ? 'drop-target' : ''}`}
      onClick={onSelect}
      onDragOver={(e) => { if (onDropFile) { e.preventDefault(); e.stopPropagation(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!onDropFile) return;
        e.preventDefault(); e.stopPropagation(); setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) onDropFile(bot.id, file);
      }}
      title={onDropFile ? `Bấm để mở dialog thao tác của ${bot.name}. Kéo-thả file .txt/.md/.json lên thẻ để lưu làm đáp án của ${bot.name} ở vòng hiện tại.` : `Bấm để mở dialog thao tác của ${bot.name}.`}
    >
      <div className="bot-card-head">
        <BotAvatar bot={bot} />
        <span className="bot-name">{bot.name}</span>
        <span className={`status status-${cell.status}`}>{STATUS_LABEL[cell.status]}</span>
        <span className="bot-chevron" aria-hidden="true">{isActive ? '▾' : '▸'}</span>
      </div>
    </div>
  );
}
