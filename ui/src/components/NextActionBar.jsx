import React from 'react';
import { useSelector } from 'react-redux';
import { BOTS, BOT_BY_ID } from '../lib/council';
import { computeNextAction, deriveCellStatus } from '../lib/nextAction';

// THANH VIEC TIEP THEO (V3, Muc 3.2) — nam o TOP BAR, luon chi hien DUNG 1
// viec quan trong nhat nguoi dung can lam. Nut chi DIEU HUONG (mo dung
// dialog/tab cua bot do) — khong tu thao tac len trang chatbot.
export default function NextActionBar({ onOpenBot }) {
  const council = useSelector((s) => s.council);
  const { answers, round, phase } = council;
  if (phase === 'setup') return null;

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

  return (
    <div className={`next-action-bar kind-${action.kind}`} role="status">
      <span className="next-action-label">Việc tiếp theo:</span>
      <span className="next-action-text">{action.text}</span>
      {action.botId && onOpenBot && (
        <button type="button" className="next-action-btn" onClick={() => onOpenBot(action.botId)}>
          Mở {bot?.name || action.botId}
        </button>
      )}
    </div>
  );
}
