import React, { useState } from 'react';
import Badge from './Badge';

// CUA SO SO SANH DAP AN (ban lam lai UI) — cua so Electron RIENG (Browser
// Window, mo qua IPC compare:open), khong de len vung trang web nhung va
// khong nhet vao sidebar 380px. Renderer doc du lieu App chinh da ghi vao
// localStorage (key hoi-dong-compare): cac dap an DA LUU cua vong hien tai.
// Moi cot: ten bot, Badge trang thai, so tu, diem tin cay (neu co) va vung
// noi dung cuon doc lap. Co nut "Luan nam tren" (always-on-top) de cua so
// khong bi cua so chinh che khuut.
export const COMPARE_STORAGE_KEY = 'hoi-dong-compare';

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export default function CompareView() {
  const [onTop, setOnTop] = useState(false);
  let data = null;
  try { data = JSON.parse(localStorage.getItem(COMPARE_STORAGE_KEY) || 'null'); } catch (_) { data = null; }
  const items = data?.items || [];

  const toggleOnTop = () => {
    const next = !onTop;
    setOnTop(next);
    if (window.councilApi?.setCompareOnTop) window.councilApi.setCompareOnTop(next);
  };

  return (
    <div className="compare-root">
      <div className="compare-head">
        <span className="compare-title">📊 So sánh đáp án{data?.round ? ` — Vòng ${data.round}` : ''}</span>
        {data?.topic && <span className="compare-topic" title={data.topic}>{data.topic}</span>}
        <label className="compare-ontop">
          <input type="checkbox" checked={onTop} onChange={toggleOnTop} /> Luôn nằm trên
        </label>
      </div>
      {items.length === 0 ? (
        <p className="compare-empty">
          Chưa có dữ liệu so sánh. Hãy quay lại cửa sổ chính, lưu ít nhất 2 đáp án trong vòng hiện tại
          rồi bấm nút “📊 So sánh đáp án” cạnh thanh Việc tiếp theo.
        </p>
      ) : (
        <div className="compare-grid">
          {items.map((it) => (
            <div key={it.id} className="compare-col">
              <div className="compare-col-head">
                <span className="compare-bot">{it.name}</span>
                <Badge status="SAVED" />
              </div>
              <div className="compare-meta">
                {wordCount(it.answer)} từ · {it.answer.length} ký tự
                {it.confidence != null ? ` · Điểm tin cậy: ${it.confidence}/100` : ''}
              </div>
              <div className="compare-body">{it.answer}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
