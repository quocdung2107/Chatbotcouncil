import React from 'react';

const ROUND_NAMES = { 1: 'Đề xuất mù', 2: 'Phản biện chéo ẩn danh', 3: 'Tác giả sửa bài' };

// Thanh tien do tren dau man hinh: 3 vong tranh luan + buoc tong hop cuoi
// o tab Muse.
export default function RoundStepper({ round, savedCounts, phase, synthesisSaved }) {
  const synthCls = phase === 'done' ? 'done' : phase === 'synthesis' ? 'current' : 'todo';
  return (
    <div className="stepper">
      {[1, 2, 3].map((r) => {
        const cls = phase === 'done' || phase === 'synthesis' || r < round ? 'done' : r === round ? 'current' : 'todo';
        return (
          <div key={r} className={`step step-${cls}`}>
            <span className="step-no">Vòng {r}</span>
            <span className="step-name">{ROUND_NAMES[r]}</span>
            <span className="step-count">{savedCounts[r]}/4 đáp án</span>
          </div>
        );
      })}
      <div className={`step step-${synthCls}`}>
        <span className="step-no">Tổng hợp</span>
        <span className="step-name">Muse chốt kết luận</span>
        <span className="step-count">{synthesisSaved ? '1/1 kết luận' : '0/1 kết luận'}</span>
      </div>
    </div>
  );
}
