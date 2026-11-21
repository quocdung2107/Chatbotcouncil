import React, { useState } from 'react';
import { STATUS } from '../store/councilSlice';
import Badge from './Badge';

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

// THE BOT GON (ban lam lai UI): cao ~40px, xep doc co dinh o COT TRAI
// (muc Tong quan) — avatar + ten + Badge trang thai thong nhat. The da Luu
// thu gon (~28px) de tiet kiem cho. Bam vao the chi CHON bot: trang web o
// giua chuyen sang tab cua bot va bang thao tac o COT PHAI hien thao tac
// cua bot do (the chi la noi chon/xem trang thai, nut bam nam ben phai).
// Keo-tha file dap an len the van dung duoc nhu cu.
export default function BotCard({ bot, cell, isActive, onSelect, onDropFile }) {
  const [dragOver, setDragOver] = useState(false);
  const saved = cell.status === STATUS.saved;
  return (
    <div
      className={`bot-card ${isActive ? 'active' : ''} ${saved ? 'compact' : ''} ${dragOver ? 'drop-target' : ''}`}
      onClick={onSelect}
      onDragOver={(e) => { if (onDropFile) { e.preventDefault(); e.stopPropagation(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!onDropFile) return;
        e.preventDefault(); e.stopPropagation(); setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) onDropFile(bot.id, file);
      }}
      title={onDropFile ? `Bấm để chọn ${bot.name} — thao tác của bot hiện ở bảng bên phải. Kéo-thả file .txt/.md/.json lên thẻ để lưu làm đáp án của ${bot.name} ở vòng hiện tại.` : `Bấm để chọn ${bot.name} — thao tác của bot hiện ở bảng bên phải.`}
    >
      <div className="bot-card-head">
        <BotAvatar bot={bot} size={saved ? 22 : 26} />
        <span className="bot-name">{bot.name}</span>
        <Badge cell={cell} className="bot-card-badge" />
      </div>
    </div>
  );
}
