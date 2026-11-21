import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { BOTS, BOT_BY_ID } from '../lib/council';
import { computeNextAction, deriveCellStatus } from '../lib/nextAction';
import { StatusDot, badgeDefForCell } from './Badge';

// THANH VIEC TIEP THEO (lam lai UI) — cao ~60px, chu 16px, luon chi hien
// DUNG 1 viec quan trong nhat + 1 nut chinh ghi ro ten bot/viec cu the
// (vd "Mo ChatGPT de gui") + 4 cham trang thai cua 4 bot o vong hien tai.
// Nut chi DIEU HUONG (mo dung vung thao tac/tab cua bot do) — khong tu thao
// tac len trang chatbot. Khi phien xong (da co ket luan), CHINH thanh nay
// bien thanh banner xanh la "🎉 Da co ket luan" — khong con banner rieng o
// day man hinh nhu ban cu.
const BTN_LABEL = {
  error: (name) => `Mở ${name} để xử lý lỗi`,
  review: (name) => `Mở ${name} để xem lại`,
  fetched: (name) => `Mở ${name} để duyệt`,
  likely_done: (name) => `Mở ${name} để lấy đáp án`,
  working: (name) => `Mở ${name} để lấy đáp án`,
  prompt_ready: (name) => `Mở ${name} để gửi`,
  synthesis: () => 'Mở Muse để tổng hợp',
};

export default function NextActionBar({ onOpenBot }) {
  const council = useSelector((s) => s.council);
  const { answers, round, phase, synthesis } = council;
  const [bannerSeen, setBannerSeen] = useState(false);
  useEffect(() => { if (phase !== 'done') setBannerSeen(false); }, [phase]);
  if (phase === 'setup') return null;

  // Phien da xong: thanh nay thanh banner ket luan ngay tai cho.
  if (phase === 'done') {
    return (
      <div className="next-action-bar kind-done" role="status">
        <span className="next-action-text">🎉 Đã có kết luận tổng hợp của Muse.{bannerSeen ? ' Bấm “Xuất kết quả” ở góc phải trên để lưu toàn bộ phiên thành file Markdown.' : ''}</span>
        {!bannerSeen && onOpenBot && (
          <button type="button" className="next-action-btn" onClick={() => onOpenBot('muse')}>Mở bản tổng hợp</button>
        )}
        {!bannerSeen && (
          <button type="button" onClick={() => setBannerSeen(true)}>Đã xem</button>
        )}
      </div>
    );
  }

  const cells = {};
  for (const b of BOTS) {
    const cell = answers[round]?.[b.id] || {};
    cells[b.id] = {
      status: deriveCellStatus(cell),
      reason: cell.skipped?.reason ? `bị bỏ qua${cell.skipped.reason ? `: ${cell.skipped.reason}` : ''}` : (cell.error || ''),
      error: cell.error || '',
      confidence: cell.confidence != null ? cell.confidence : undefined,
    };
    if (cell.needsReview) cells[b.id].reason = 'bị gắn cờ cần xem lại';
  }
  const action = computeNextAction({
    cells,
    round,
    botOrder: BOTS.map((b) => ({ id: b.id, name: b.name })),
    phase,
  });
  const bot = action.botId ? BOT_BY_ID[action.botId] || (action.botId === 'muse' ? { name: 'Muse' } : null) : null;
  const btnLabel = action.botId ? (BTN_LABEL[action.kind] || ((name) => `Mở ${name}`))(bot?.name || action.botId) : '';

  // Buoc tong hop (chua xong): giu thanh thong thuong nhung nhan manh Muse.
  const synthNote = phase === 'synthesis' && synthesis?.status !== 'saved'
    ? ' Đã đủ 3 vòng — tới bước TỔNG HỢP ở thẻ Muse.'
    : '';

  return (
    <div className={`next-action-bar kind-${action.kind}`} role="status">
      <span className="next-action-label">Việc tiếp theo:</span>
      <span className="next-action-text">{action.text}{synthNote}</span>
      <span className="next-action-dots" title="Trạng thái 4 bot ở vòng hiện tại">
        {BOTS.map((b) => {
          const cell = answers[round]?.[b.id] || {};
          const def = badgeDefForCell(cell);
          return <StatusDot key={b.id} cell={cell} title={`${b.name}: ${def.label}`} />;
        })}
      </span>
      {action.botId && onOpenBot && (
        <button type="button" className="next-action-btn" onClick={() => onOpenBot(action.botId)}>
          {btnLabel}
        </button>
      )}
    </div>
  );
}
