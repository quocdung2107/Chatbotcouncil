import React from 'react';

const ROUND_NAMES = { 1: 'Đề xuất mù', 2: 'Phản biện chéo ẩn danh', 3: 'Tác giả sửa bài' };

// Thanh 3 vong tren dau man hinh: vong nao dang lam, moi vong da luu may dap an.
export default function RoundStepper({ round, savedCounts, phase }) {
  return (
    <div className="stepper">
      {[1, 2, 3].map((r) => {
        const cls = phase === 'done' || r < round ? 'done' : r === round ? 'current' : 'todo';
        return (
          <div key={r} className={`step step-${cls}`}>
            <span className="step-no">Vòng {r}</span>
            <span className="step-name">{ROUND_NAMES[r]}</span>
            <span className="step-count">{savedCounts[r]}/4 đáp án</span>
          </div>
        );
      })}
    </div>
  );
}
