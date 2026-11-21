import React from 'react';
import { BOTS } from '../lib/council';
import { StatusDot, badgeDefForCell } from './Badge';

// Ten vong de hieu ngay (ban lam lai UI) — bo thuat ngu kho hieu ban cu
// ("De xuat mu / Phan bien cheo an danh / Tac gia sua bai").
export const ROUND_NAMES = {
  1: 'Mỗi bot tự đề xuất',
  2: 'Các bot nhận xét lẫn nhau (không hiện tên)',
  3: 'Mỗi bot sửa lại bài của mình',
};

// Thanh tien do: 3 vong tranh luan + buoc tong hop cuoi o tab Muse.
// Bo cuc 3 cot: nam o muc "Tong quan" tren COT TRAI voi prop `vertical`
// (cac giai doan xep doc cho vua cot 300px). Duoi MOI giai doan co cac cham
// trang thai nho cua tung bot (Badge thong nhat) de nhin 1 cai la biet bot
// nao xong/cho/loi o vong do.
// Che do nhanh (opt-in): chi 1 luot noi tiep roi sang tong hop.
export default function RoundStepper({ round, savedCounts, phase, synthesisSaved, mode, answers, synthesis, vertical }) {
  const stepperCls = `stepper${vertical ? ' vertical' : ''}`;
  const synthCls = phase === 'done' ? 'done' : phase === 'synthesis' ? 'current' : 'todo';
  const dotsFor = (r) => (
    <span className="step-dots">
      {BOTS.map((b) => {
        const cell = answers?.[r]?.[b.id] || {};
        const def = badgeDefForCell(cell);
        return <StatusDot key={b.id} cell={cell} title={`Vòng ${r} — ${b.name}: ${def.label}`} />;
      })}
    </span>
  );
  const synthDots = (
    <span className="step-dots">
      <StatusDot cell={synthesis || {}} title={`Tổng hợp — Muse: ${badgeDefForCell(synthesis || {}).label}`} />
    </span>
  );
  if (mode === 'fast') {
    const cls = phase === 'done' || phase === 'synthesis' ? 'done' : 'current';
    return (
      <div className={stepperCls}>
        <div className={`step step-${cls}`}>
          <span className="step-no">1 lượt nối tiếp</span>
          <span className="step-name">Bot sau đọc bài bot trước, bổ sung/sửa</span>
          {dotsFor(1)}
          <span className="step-count">{savedCounts[1]}/4 đáp án</span>
        </div>
        <div className={`step step-${synthCls}`}>
          <span className="step-no">Tổng hợp</span>
          <span className="step-name">Muse kết luận</span>
          {synthDots}
          <span className="step-count">{synthesisSaved ? '1/1 kết luận' : '0/1 kết luận'}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={stepperCls}>
      {[1, 2, 3].map((r) => {
        const cls = phase === 'done' || phase === 'synthesis' || r < round ? 'done' : r === round ? 'current' : 'todo';
        return (
          <div key={r} className={`step step-${cls}`}>
            <span className="step-no">Vòng {r}</span>
            <span className="step-name">{ROUND_NAMES[r]}</span>
            {dotsFor(r)}
            <span className="step-count">{savedCounts[r]}/4 đáp án</span>
          </div>
        );
      })}
      <div className={`step step-${synthCls}`}>
        <span className="step-no">Tổng hợp</span>
        <span className="step-name">Muse kết luận</span>
        {synthDots}
        <span className="step-count">{synthesisSaved ? '1/1 kết luận' : '0/1 kết luận'}</span>
      </div>
    </div>
  );
}
