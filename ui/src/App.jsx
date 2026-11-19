import React, { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BOTS, SYNTH_BOT } from './lib/council';
import {
  topicChanged, startSession, selectBot, setViewMode, markSent,
  answerEdited, saveAnswer, resetAll,
  synthesisMarkSent, synthesisAnswerEdited, synthesisSaved,
  copyPromptRequested, pasteAnswerRequested, exportRequested,
  copySynthesisPromptRequested, pasteSynthesisAnswerRequested,
  selectRoundSavedCount, selectTotalSavedCount, STATUS,
} from './store/councilSlice';
import BotCard from './components/BotCard';
import RoundStepper from './components/RoundStepper';

export default function App() {
  const dispatch = useDispatch();
  const council = useSelector((s) => s.council);
  const { topic, phase, round, activeBotId, viewMode, answers, synthesis, log } = council;
  const savedCounts = {
    1: useSelector((s) => selectRoundSavedCount(s, 1)),
    2: useSelector((s) => selectRoundSavedCount(s, 2)),
    3: useSelector((s) => selectRoundSavedCount(s, 3)),
  };
  const totalSaved = useSelector(selectTotalSavedCount);
  const browserRef = useRef(null);
  // Dang chay trong Electron (co window.councilApi) hay trinh duyet thuong?
  // Trinh duyet thuong khong nhung duoc chatbot — phai co nut mo tab that.
  const isElectron = typeof window !== 'undefined' && !!window.councilApi;

  // Dong bo vi tri/kich thuoc cua khu vuc trinh duyet cho Electron main,
  // de cac WebContentsView nam dung cho tren giao dien React.
  const sendLayout = useCallback(() => {
    const api = window.councilApi;
    if (!api) return;
    if (phase === 'setup' || !browserRef.current) { api.hideViews(); return; }
    const r = browserRef.current.getBoundingClientRect();
    api.layoutViews({
      mode: viewMode,
      activeId: activeBotId,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    });
  }, [phase, viewMode, activeBotId]);

  useEffect(() => {
    sendLayout();
    const onResize = () => sendLayout();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => sendLayout());
    if (browserRef.current) ro.observe(browserRef.current);
    return () => { window.removeEventListener('resize', onResize); ro.disconnect(); };
  }, [sendLayout]);

  const apiCall = (fn, arg) => { if (window.councilApi?.[fn]) window.councilApi[fn](arg); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🗣️ Chat Hội Đồng</div>
        {phase !== 'setup' && <div className="topic-title" title={topic.title}>{topic.title}</div>}
        <div className="topbar-right">
          <span className="progress">Tiến độ: {totalSaved}/12 đáp án</span>
          {phase !== 'setup' && (
            <>
              <div className="mode-toggle">
                <button type="button" className={viewMode === 'tabs' ? 'on' : ''} onClick={() => dispatch(setViewMode('tabs'))}>1 tab</button>
                <button type="button" className={viewMode === 'grid' ? 'on' : ''} onClick={() => dispatch(setViewMode('grid'))}>Lưới 4 ô</button>
              </div>
              <button type="button" onClick={() => dispatch(exportRequested())}>Xuất kết quả</button>
              <button type="button" onClick={() => { if (window.confirm('Bắt đầu chủ đề mới? Toàn bộ đáp án hiện tại sẽ bị xoá.')) dispatch(resetAll()); }}>Chủ đề mới</button>
            </>
          )}
        </div>
      </header>

      {phase !== 'setup' && <RoundStepper round={round} savedCounts={savedCounts} phase={phase} synthesisSaved={synthesis?.status === STATUS.saved} />}

      <div className="main-row">
        {phase === 'setup' ? (
          <section className="setup">
            <h1>Tạo chủ đề hội đồng mới</h1>
            <p className="setup-note">
              4 chatbot miễn phí (ChatGPT, Claude, Gemini, Copilot) sẽ thảo luận 3 vòng:
              đề xuất mù → phản biện chéo ẩn danh → tác giả sửa bài. Sau vòng 3, tab
              Muse (đăng nhập bằng tài khoản Muse của bạn) sẽ đọc cả 4 bản cuối và
              chốt KẾT LUẬN TỔNG HỢP cuối cùng. Bạn là người dán prompt,
              bấm Gửi và copy đáp án về — app lo phần prompt, form và trạng thái.
            </p>
            <label>Chủ đề *
              <input
                value={topic.title}
                onChange={(e) => dispatch(topicChanged({ field: 'title', value: e.target.value }))}
                placeholder="Ví dụ: Nên chọn hướng A hay B cho sản phẩm X?"
              />
            </label>
            <label>Mục tiêu chung
              <input
                value={topic.goal}
                onChange={(e) => dispatch(topicChanged({ field: 'goal', value: e.target.value }))}
                placeholder="Để trống thì dùng luôn chủ đề làm mục tiêu"
              />
            </label>
            <label>Tiêu chí chấm (mỗi dòng 1 tiêu chí)
              <textarea
                rows={4}
                value={topic.criteriaText}
                onChange={(e) => dispatch(topicChanged({ field: 'criteriaText', value: e.target.value }))}
                placeholder={'Đúng trọng tâm\nCó căn cứ kiểm chứng được\nKhả thi với nguồn lực hiện tại'}
              />
            </label>
            <button type="button" className="primary big" disabled={!topic.title.trim()} onClick={() => dispatch(startSession())}>
              Bắt đầu phiên hội đồng
            </button>
          </section>
        ) : (
          <>
            <section className="browser-area" ref={browserRef}>
              <div className="browser-placeholder">
                {isElectron
                  ? (viewMode === 'tabs'
                    ? `Đang hiển thị tab của ${[...BOTS, SYNTH_BOT].find((b) => b.id === activeBotId)?.name}. Lần đầu dùng, hãy đăng nhập ngay trong tab này — app sẽ nhớ đăng nhập cho lần sau.`
                    : 'Đang hiển thị cả 4 chatbot trong lưới 2×2. Bấm vào thẻ bot ở cột phải để làm việc với từng bot. Tab Muse (tổng hợp) chỉ hiện ở chế độ 1 tab.')
                  : (
                    <div className="open-bots">
                      <p><strong>Bạn đang chạy giao diện bằng trình duyệt thường</strong> nên các chatbot không nhúng trong khung này được (chỉ bản app Electron mới nhúng được, mà bản đó đang bị Cloudflare chặn ở bước xác thực). Hãy bấm nút của từng chatbot để mở tab thật, đăng nhập ngay trong tab đó:</p>
                      <div className="open-bots-row">
                        {[...BOTS, SYNTH_BOT].map((b) => (
                          <a key={b.id} className="open-bot-btn" href={b.url} target="_blank" rel="noreferrer">Mở {b.name} ↗</a>
                        ))}
                      </div>
                      <p>Luồng làm việc: bấm “Copy prompt” ở thẻ bot bên phải → sang tab chatbot vừa mở, dán (Ctrl+V) và bấm Gửi → copy đáp án → quay lại đây bấm “Dán đáp án về”. Panel này giữ prompt, form, trạng thái và tự chuyển vòng cho bạn.</p>
                    </div>
                  )}
              </div>
            </section>

            <aside className="sidebar">
              <div className="sidebar-title">Vòng {round} — thao tác cho từng bot</div>
              {BOTS.map((bot) => (
                <BotCard
                  key={bot.id}
                  bot={bot}
                  cell={answers[round][bot.id]}
                  isActive={activeBotId === bot.id}
                  onSelect={() => dispatch(selectBot(bot.id))}
                  onCopy={() => dispatch(copyPromptRequested(bot.id))}
                  onSent={() => dispatch(markSent(bot.id))}
                  onPaste={() => dispatch(pasteAnswerRequested(bot.id))}
                  onSave={() => dispatch(saveAnswer(bot.id))}
                  onEdit={(value) => dispatch(answerEdited({ botId: bot.id, answer: value }))}
                  onReload={() => apiCall('reloadBot', bot.id)}
                  onNewSession={() => apiCall('newSession', bot.id)}
                  browserMode={!isElectron}
                />
              ))}

              <div className="sidebar-title">Bước cuối — Tổng hợp (sau vòng 3)</div>
              <BotCard
                bot={SYNTH_BOT}
                cell={synthesis || { status: STATUS.idle, answer: '' }}
                isActive={activeBotId === 'muse'}
                onSelect={() => dispatch(selectBot('muse'))}
                onCopy={() => dispatch(copySynthesisPromptRequested())}
                onSent={() => dispatch(synthesisMarkSent())}
                onPaste={() => dispatch(pasteSynthesisAnswerRequested())}
                onSave={() => dispatch(synthesisSaved())}
                onEdit={(value) => dispatch(synthesisAnswerEdited(value))}
                onReload={() => apiCall('reloadBot', 'muse')}
                onNewSession={() => apiCall('newSession', 'muse')}
                browserMode={!isElectron}
                synth
              />

              <div className="sidebar-title">Nhật ký thao tác</div>
              <div className="log">
                {log.length === 0 && <div className="log-empty">Chưa có thao tác nào.</div>}
                {log.slice(0, 30).map((entry, i) => (
                  <div key={i} className="log-item"><span className="log-time">{entry.time}</span> {entry.text}</div>
                ))}
              </div>
            </aside>
          </>
        )}
      </div>

      {phase === 'synthesis' && (
        <div className="done-banner">🧭 Đã đủ 3 vòng — giờ tới bước TỔNG HỢP: chọn thẻ “Muse — Tổng hợp” ở cột phải, copy prompt tổng hợp, dán vào tab Muse và bấm Gửi, rồi dán kết luận về.</div>
      )}
      {phase === 'done' && (
        <div className="done-banner">✅ Đã có kết luận tổng hợp của Muse. Bấm “Xuất kết quả” ở góc phải trên để lưu toàn bộ đáp án + kết luận thành file Markdown.</div>
      )}
    </div>
  );
}
