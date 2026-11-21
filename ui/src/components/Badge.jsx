import React from 'react';
import { CELL_STATUS, deriveCellStatus } from '../lib/nextAction';

// BADGE TRANG THAI THONG NHAT (ban lam lai UI) — 1 component duy nhat dung
// cho: the bot, bang tien trinh 4x3 o tab Tep, thanh tien trinh vong va cac
// cham trang thai o thanh Viec tiep theo. CHI 5 NHOM MAU; 8+ trang thai phan
// biet bang IKON + CHU tieng Viet, mau chi la lop phu (khong dua vao mau de
// nhan biet). Anh xa tu deriveCellStatus (lib/nextAction.js) — KHONG doi
// state machine V3.
export const BADGE_DEFS = {
  [CELL_STATUS.NOT_READY]: { group: 'grey', icon: '⚪', label: 'Chưa làm' },
  [CELL_STATUS.PROMPT_READY]: { group: 'blue', icon: '📋', label: 'Đã có câu hỏi' },
  [CELL_STATUS.FILLED]: { group: 'blue', icon: '📋', label: 'Đã có câu hỏi' },
  [CELL_STATUS.WAITING]: { group: 'blue', icon: '🕐', label: 'Đang chờ trả lời' },
  [CELL_STATUS.LIKELY_DONE]: { group: 'blue', icon: '🕐', label: 'Có vẻ đã trả lời xong' },
  [CELL_STATUS.FETCHED]: { group: 'orange', icon: '👁', label: 'Chờ bạn duyệt' },
  [CELL_STATUS.NEEDS_REVIEW]: { group: 'orange-strong', icon: '⚠', label: 'Cần xem lại' },
  [CELL_STATUS.SAVED]: { group: 'green', icon: '✅', label: 'Đã lưu' },
  [CELL_STATUS.SKIPPED]: { group: 'grey', icon: '⏭', label: 'Đã bỏ qua', strike: true },
  [CELL_STATUS.ERROR]: { group: 'red', icon: '⛔', label: 'Lỗi' },
};

export function badgeDefForCell(cell) {
  const status = deriveCellStatus(cell);
  return { status, ...(BADGE_DEFS[status] || BADGE_DEFS[CELL_STATUS.NOT_READY]) };
}

export function badgeDefForStatus(status) {
  return { status, ...(BADGE_DEFS[status] || BADGE_DEFS[CELL_STATUS.NOT_READY]) };
}

// Badge day du: ikon + chu. Dung o the bot va bang tien trinh.
export default function Badge({ cell, status, className = '' }) {
  const def = status ? badgeDefForStatus(status) : badgeDefForCell(cell);
  return (
    <span className={`badge badge-${def.group} ${className}`} title={def.label}>
      <span aria-hidden="true">{def.icon}</span>{' '}
      <span className={def.strike ? 'badge-strike' : ''}>{def.label}</span>
    </span>
  );
}

// Cham trang thai nho (chi ikon tren nen mau nhom) — dung duoi moi giai doan
// cua thanh tien trinh vong va canh thanh Viec tiep theo.
export function StatusDot({ cell, status, title }) {
  const def = status ? badgeDefForStatus(status) : badgeDefForCell(cell);
  return (
    <span className={`status-dot dot-${def.group}`} title={title || def.label} aria-label={def.label}>
      {def.icon}
    </span>
  );
}
