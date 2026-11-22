import React from 'react';
import { useSelector } from 'react-redux';
import { BOTS, BOT_BY_ID } from '../lib/council';
import { ROUND_NAMES } from './RoundStepper';
import { STATUS } from '../store/councilSlice';

// THONG BAO DON GIAN o dau cot phai (thay thanh "Viec tiep theo" cu).
// Ly do doi: 4 bot lam viec SONG SONG nen 1 goi y "viec tiep theo" cho 1
// bot cu the la lech va gay hieu nham. O day chi hien SU THAT trung tinh:
// dang o vong nao, da luu bao nhieu, co loi o bot nao — khong chi dao
// nguoi dung phai bam gi. Nut So sanh dap an nam ngay duoi thong bao nay.
export default function SimpleNotice() {
  const council = useSelector((s) => s.council);
  const { answers, round, phase } = council;
  if (phase === 'setup') return null;

  if (phase === 'done') {
    return (
      <div className="simple-notice done" role="status">
        <div className="simple-notice-line">🎉 Đã có kết luận tổng hợp.</div>
      </div>
    );
  }

  const savedInRound = BOTS.filter((b) => answers[round]?.[b.id]?.status === STATUS.saved).length;
  const skippedInRound = BOTS.filter((b) => answers[round]?.[b.id]?.status === STATUS.skipped).length;
  const totalSaved = [1, 2, 3].reduce(
    (sum, r) => sum + BOTS.filter((b) => answers[r]?.[b.id]?.status === STATUS.saved).length,
    0,
  );
  const errorBot = BOTS.find((b) => (answers[round]?.[b.id]?.error || '').trim());

  return (
    <div className="simple-notice" role="status">
      {phase === 'synthesis' ? (
        <div className="simple-notice-line">Đã đủ 3 vòng — mở thẻ Muse ở cột trái để lấy kết luận tổng hợp.</div>
      ) : (
        <div className="simple-notice-line">
          Vòng {round} — {ROUND_NAMES[round] || ''}: đã lưu {savedInRound}/4 đáp án
          {skippedInRound > 0 ? ` · bỏ qua ${skippedInRound}` : ''}
        </div>
      )}
      <div className="simple-notice-line muted">Tổng tiến độ: {totalSaved}/12 đáp án.</div>
      {phase !== 'synthesis' && errorBot && (
        <div className="simple-notice-line warn">
          ⚠ Có lỗi ở {BOT_BY_ID[errorBot.id]?.name || errorBot.id} — bấm thẻ của bot ở cột trái để xem.
        </div>
      )}
    </div>
  );
}
