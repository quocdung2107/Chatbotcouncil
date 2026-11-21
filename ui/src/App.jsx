import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BOTS, SYNTH_BOT, sessionFileName } from './lib/council';
import {
  topicChanged, startSession, selectBot, setViewMode, markSent,
  answerEdited, saveAnswer, resetAll,
  synthesisMarkSent, synthesisAnswerEdited, synthesisSaved,
  copyPromptRequested, pasteAnswerRequested, fetchAnswerRequested, exportRequested,
  copySynthesisPromptRequested, pasteSynthesisAnswerRequested, fetchSynthesisAnswerRequested,
  fillComposerRequested, fillSynthesisComposerRequested,
  scanCandidatesRequested, startPickRequested, applySelectorRequested, clearSelectorRequested,
  filesInitRequested, refreshFilesRequested, contextLoaded, recentFilesUpdated, logAdded, logCleared,
  openSessionRequested, dropAnswerFileRequested, botSkipped,
  selectRoundSavedCount, selectTotalSavedCount, STATUS,
} from './store/councilSlice';
import BotCard from './components/BotCard';
import BotDialog from './components/BotDialog';
import RoundStepper from './components/RoundStepper';
import FilesPanel from './components/FilesPanel';
import GeminiPanel from './components/GeminiPanel';
import NextActionBar from './components/NextActionBar';
import { COMPARE_STORAGE_KEY } from './components/CompareView';

// Mau chu de co san o man hinh bat dau: bam 1 lan la dien san Tieu de +
// Muc tieu/boi canh + Tieu chi cham (nguoi dung sua lai theo y minh).
const TOPIC_TEMPLATES = [
  {
    label: 'Đánh giá một ý tưởng kinh doanh',
    title: 'Có nên triển khai ý tưởng kinh doanh này không?',
    goal: 'Mục tiêu cần đạt: chốt có làm hay không và bước đi đầu tiên. Giới hạn/ràng buộc: vốn, thời gian, nhân lực hiện có. Điều đã thử: ghi ở đây nếu có.',
    criteriaText: 'Có căn cứ kiểm chứng được\nKhả thi với nguồn lực hiện tại\nNêu rõ rủi ro lớn nhất',
  },
  {
    label: 'So sánh để chọn giữa 2–3 phương án',
    title: 'Nên chọn phương án A, B hay C cho vấn đề của tôi?',
    goal: 'Mục tiêu cần đạt: chốt 1 phương án. Giới hạn/ràng buộc: ngân sách và hạn chót. Điều đã thử: ghi ở đây nếu có.',
    criteriaText: 'So sánh mọi phương án trên cùng tiêu chí\nChốt 1 phương án, không liệt kê cả hai như nhau\nKế hoạch hành động làm được ngay',
  },
  {
    label: 'Lập kế hoạch cho một dự án',
    title: 'Lập kế hoạch triển khai dự án của tôi trong 30 ngày',
    goal: 'Mục tiêu cần đạt: kết quả cụ thể sau 30 ngày. Giới hạn/ràng buộc: thời gian mỗi ngày và ngân sách. Điều đã thử: ghi ở đây nếu có.',
    criteriaText: 'Chia bước theo tuần, mỗi bước có kết quả kiểm chứng được\nƯu tiên việc quan trọng nhất làm trước\nNêu rõ điểm có thể làm chậm tiến độ',
  },
];

const PROCESS_PREVIEW = [
  { icon: '📝', name: 'Vòng 1 — Mỗi bot tự đề xuất', note: '4 bot trả lời độc lập, chưa thấy bài của nhau' },
  { icon: '💬', name: 'Vòng 2 — Bot nhận xét lẫn nhau', note: 'Mỗi bot chấm bài của bot khác, không hiện tên tác giả' },
  { icon: '✏️', name: 'Vòng 3 — Mỗi bot sửa lại bài của mình', note: 'Tác giả đọc nhận xét rồi chốt bản cuối' },
  { icon: '🧭', name: 'Tổng hợp — Muse kết luận', note: 'Muse đọc cả 4 bản cuối và chốt kết luận chung' },
];

export default function App() {
  const dispatch = useDispatch();
  const council = useSelector((s) => s.council);
  const { topic, phase, round, activeBotId, viewMode, answers, synthesis, log, extractUi, integrityError } = council;
  const savedCounts = {
    1: useSelector((s) => selectRoundSavedCount(s, 1)),
    2: useSelector((s) => selectRoundSavedCount(s, 2)),
    3: useSelector((s) => selectRoundSavedCount(s, 3)),
  };
  const totalSaved = useSelector(selectTotalSavedCount);
  const browserRef = useRef(null);
  // Bot dang duoc chon cho VUNG THAO TAC GHIM (doc lap voi tab trang web
  // dang chon — doi bot chi doi noi dung vung ghim, khong day noi dung xuong).
  const [dialogBotId, setDialogBotId] = useState('');
  // Tab cua sidebar: thao tac | tep | dieu phoi (Gemini). Mac dinh Thao tac.
  const [sidebarTab, setSidebarTab] = useState('actions');
  // Dang chay trong Electron (co window.councilApi) hay trinh duyet thuong?
  // Trinh duyet thuong khong nhung duoc chatbot — phai co nut mo tab that.
  const isElectron = typeof window !== 'undefined' && !!window.councilApi;
  const consentPending = council.coordinator?.consent === null;

  // Vua vao phien (hoac doi vong) ma chua chon bot cho vung ghim thi mac
  // dinh chon bot dang active de nguoi dung thay ngay buoc can lam.
  useEffect(() => {
    if (phase !== 'setup' && !dialogBotId) setDialogBotId(activeBotId || 'chatgpt');
  }, [phase, dialogBotId, activeBotId]);

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

  // Workflow file: khoi tao thu muc lam viec / lich su tu Electron main, va
  // tu lam moi panel tien trinh khi file trong thu muc phien thay doi (fs.watch).
  const [isDragging, setIsDragging] = useState(false);
  const refreshTimer = useRef(null);
  useEffect(() => { dispatch(filesInitRequested()); }, [dispatch]);
  useEffect(() => {
    const fsx = window.councilFs;
    if (!fsx?.onChanged) return undefined;
    const off = fsx.onChanged(() => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => dispatch(refreshFilesRequested()), 400);
    });
    return () => { if (off) off(); clearTimeout(refreshTimer.current); };
  }, [dispatch]);

  // Keo-tha file vao app: file .txt/.md/.json tro thanh NGU CANH (dinh vao
  // prompt vong 1 + tong hop). Ban Electron doc bang duong dan that va ghi
  // vao danh sach file gan day; che do trinh duyet doc thang noi dung file.
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = [...(e.dataTransfer?.files || [])];
    if (!dropped.length) return;
    const fsx = window.councilFs;
    const parts = [];
    const names = [];
    for (const file of dropped) {
      if (!/\.(txt|md|json|csv)$/i.test(file.name)) {
        dispatch(logAdded(`Bỏ qua file "${file.name}" — chỉ nạp được file văn bản .txt/.md/.json/.csv làm ngữ cảnh.`));
        continue;
      }
      try {
        const filePath = fsx?.getDroppedFilePath ? fsx.getDroppedFilePath(file) : '';
        if (fsx?.readPath && filePath) {
          const result = await fsx.readPath(filePath);
          if (!result?.ok) { dispatch(logAdded(`Không đọc được file "${file.name}": ${result?.error || 'lỗi không rõ'}`)); continue; }
          parts.push(`--- File: ${result.name} ---\n${result.content}`);
          names.push(result.name);
          if (result.recentFiles) dispatch(recentFilesUpdated(result.recentFiles));
        } else {
          const text = await file.text();
          parts.push(`--- File: ${file.name} ---\n${text}`);
          names.push(file.name);
        }
      } catch (err) {
        dispatch(logAdded(`Không đọc được file "${file.name}": ${String(err)}`));
      }
    }
    if (parts.length) {
      dispatch(contextLoaded({ name: names.join(', '), path: '', text: parts.join('\n\n').slice(0, 60000) }));
    }
  };

  // Tha file len THE BOT: noi dung file tro thanh dap an cua bot do o vong
  // hien tai (saga ghi vao thu muc cua bot). Tha len the Muse thi thanh ket
  // luan tong hop. Tha ra ngoai the (xu ly o handleDrop) thi lam ngu canh.
  const handleBotDrop = async (botId, file) => {
    if (!/\.(txt|md|json)$/i.test(file.name)) {
      dispatch(logAdded(`Bỏ qua file "${file.name}" — chỉ nhận file .txt/.md/.json lên thẻ bot.`));
      return;
    }
    const fsx = window.councilFs;
    try {
      const filePath = fsx?.getDroppedFilePath ? fsx.getDroppedFilePath(file) : '';
      if (fsx?.readPath && filePath) {
        const result = await fsx.readPath(filePath);
        if (!result?.ok) { dispatch(logAdded(`Không đọc được file "${file.name}": ${result?.error || 'lỗi không rõ'}`)); return; }
        dispatch(dropAnswerFileRequested({ botId, name: result.name, path: result.path, text: result.content }));
        if (result.recentFiles) dispatch(recentFilesUpdated(result.recentFiles));
      } else {
        dispatch(dropAnswerFileRequested({ botId, name: file.name, path: '', text: await file.text() }));
      }
    } catch (err) {
      dispatch(logAdded(`Không đọc được file "${file.name}": ${String(err)}`));
    }
  };

  // SO SANH DAP AN: gom cac dap an DA LUU cua vong hien tai, ghi vao
  // localStorage roi mo cua so Electron rieng (?compare=1). Nut chi bat khi
  // da luu tu 2 dap an trong vong nay.
  const savedThisRound = BOTS.filter((b) => answers[round]?.[b.id]?.status === STATUS.saved);
  const compareEnabled = savedThisRound.length >= 2;
  const openCompare = () => {
    if (!compareEnabled) return;
    const payload = {
      round,
      topic: topic.title,
      items: savedThisRound.map((b) => ({
        id: b.id,
        name: b.name,
        answer: answers[round][b.id].answer || '',
        confidence: answers[round][b.id].confidence != null ? answers[round][b.id].confidence : null,
      })),
    };
    try { localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(payload)); } catch (_) { /* bo qua */ }
    if (window.councilApi?.openCompare) window.councilApi.openCompare();
    else window.open('?compare=1', '_blank');
  };

  const applyTemplate = (t) => {
    dispatch(topicChanged({ field: 'title', value: t.title }));
    dispatch(topicChanged({ field: 'goal', value: t.goal }));
    dispatch(topicChanged({ field: 'criteriaText', value: t.criteriaText }));
  };

  // Vung thao tac ghim cho bot dang chon (4 bot tranh luan hoac Muse).
  const renderPinnedDialog = () => {
    if (dialogBotId === 'muse') {
      return (
        <BotDialog
          bot={SYNTH_BOT}
          cell={synthesis || { status: STATUS.idle, answer: '' }}
          synth
          browserMode={!isElectron}
          onCopy={() => dispatch(copySynthesisPromptRequested())}
          onFillComposer={() => dispatch(fillSynthesisComposerRequested())}
          onSent={() => dispatch(synthesisMarkSent())}
          onFetch={() => dispatch(fetchSynthesisAnswerRequested())}
          onPaste={() => dispatch(pasteSynthesisAnswerRequested())}
          onSave={() => dispatch(synthesisSaved())}
          onEdit={(value) => dispatch(synthesisAnswerEdited(value))}
          onReload={() => apiCall('reloadBot', 'muse')}
          onNewSession={() => apiCall('newSession', 'muse')}
          candidates={extractUi?.candidates?.muse || []}
          picking={extractUi?.picking || ''}
          round={round}
          onApplySelector={(selector, source, fingerprint) => dispatch(applySelectorRequested({ botId: 'muse', selector, source, fingerprint }))}
          onClearSelector={() => dispatch(clearSelectorRequested('muse'))}
          onClose={() => setDialogBotId('')}
        />
      );
    }
    const bot = BOTS.find((b) => b.id === dialogBotId);
    if (!bot) {
      return <div className="pinned-empty">Bấm vào 1 thẻ bot ở trên để mở vùng thao tác của bot đó tại đây.</div>;
    }
    return (
      <BotDialog
        bot={bot}
        cell={answers[round][bot.id]}
        browserMode={!isElectron}
        onCopy={() => dispatch(copyPromptRequested(bot.id))}
        onFillComposer={() => dispatch(fillComposerRequested(bot.id))}
        onSent={() => dispatch(markSent(bot.id))}
        onFetch={() => dispatch(fetchAnswerRequested(bot.id))}
        onPaste={() => dispatch(pasteAnswerRequested(bot.id))}
        onSave={() => dispatch(saveAnswer(bot.id))}
        onEdit={(value) => dispatch(answerEdited({ botId: bot.id, answer: value }))}
        onReload={() => apiCall('reloadBot', bot.id)}
        onNewSession={() => apiCall('newSession', bot.id)}
        candidates={extractUi?.candidates?.[bot.id] || []}
        picking={extractUi?.picking || ''}
        round={round}
        onSkip={(reason) => dispatch(botSkipped({ botId: bot.id, reason }))}
        integrityError={integrityError}
        lowCandidates={extractUi?.lowCandidates?.[bot.id] || []}
        fileExists={(council.files?.sessionFiles || []).some((f) => f.name === sessionFileName(bot.id, round))}
        onScan={() => dispatch(scanCandidatesRequested(bot.id))}
        onStartPick={() => dispatch(startPickRequested(bot.id))}
        onApplySelector={(selector, source, fingerprint) => dispatch(applySelectorRequested({ botId: bot.id, selector, source, fingerprint }))}
        onClearSelector={() => dispatch(clearSelectorRequested(bot.id))}
        onClose={() => setDialogBotId('')}
      />
    );
  };

  const openBot = (botId) => { dispatch(selectBot(botId)); setDialogBotId(botId); setSidebarTab('actions'); };

  return (
    <div
      className="app"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragging(false); }}
      onDrop={handleDrop}
    >
      {isDragging && <div className="drop-overlay">Thả file .txt / .md / .json vào đây để nạp làm ngữ cảnh cho hội đồng</div>}
      <header className="topbar">
        <div className="brand">🗣️ Chat Hội Đồng</div>
        {phase !== 'setup' && <div className="topic-title" title={topic.title}>{topic.title}</div>}
        <div className="topbar-right">
          <span className="progress">Tiến độ: {totalSaved}/12 đáp án</span>
          {phase !== 'setup' && (
            <>
              <div className="mode-toggle">
                <button type="button" className={viewMode === 'tabs' ? 'on' : ''} onClick={() => dispatch(setViewMode('tabs'))}>1 tab</button>
                <button type="button" className={viewMode === 'grid' ? 'on' : ''} onClick={() => dispatch(setViewMode('grid'))}>Xem 4 trang cùng lúc</button>
              </div>
              <button type="button" onClick={() => dispatch(exportRequested())}>Xuất kết quả</button>
              <button type="button" onClick={() => { if (window.confirm('Bắt đầu chủ đề mới? Toàn bộ đáp án hiện tại sẽ bị xoá.')) dispatch(resetAll()); }}>Chủ đề mới</button>
            </>
          )}
        </div>
      </header>

      {phase !== 'setup' && (
        <RoundStepper
          round={round}
          savedCounts={savedCounts}
          phase={phase}
          synthesisSaved={synthesis?.status === STATUS.saved}
          mode={topic.mode}
          answers={answers}
          synthesis={synthesis}
        />
      )}

      {phase !== 'setup' && (
        <div className="action-row">
          <NextActionBar onOpenBot={openBot} />
          <button
            type="button"
            className="compare-btn"
            disabled={!compareEnabled}
            onClick={openCompare}
            title={compareEnabled ? 'Mở cửa sổ riêng xem các đáp án đã lưu của vòng này cạnh nhau' : 'Cần ít nhất 2 đáp án ĐÃ LƯU trong vòng hiện tại mới so sánh được'}
          >
            📊 So sánh đáp án
          </button>
        </div>
      )}

      <div className="main-row">
        {phase === 'setup' ? (
          <section className="setup">
            <h1>Tạo chủ đề hội đồng mới</h1>
            <p className="setup-note">
              4 chatbot miễn phí (ChatGPT, Claude, Gemini, Copilot) sẽ thảo luận 3 vòng:
              mỗi bot tự đề xuất → các bot nhận xét lẫn nhau (không hiện tên) → mỗi bot sửa lại bài của mình.
              Sau vòng 3, tab Muse (đăng nhập bằng tài khoản Muse của bạn) sẽ đọc cả 4 bản cuối và
              chốt KẾT LUẬN TỔNG HỢP cuối cùng. Bạn là người dán lời nhắc,
              bấm Gửi và lấy đáp án về — app lo phần lời nhắc, form và trạng thái.
            </p>
            <div className="setup-grid">
              <div className="setup-form">
                <label>Chủ đề *
                  <input
                    value={topic.title}
                    onChange={(e) => dispatch(topicChanged({ field: 'title', value: e.target.value }))}
                    placeholder="Ví dụ: Nên chọn hướng A hay B cho sản phẩm X?"
                  />
                </label>
                <label>Mục tiêu / bối cảnh
                  <input
                    value={topic.goal}
                    onChange={(e) => dispatch(topicChanged({ field: 'goal', value: e.target.value }))}
                    placeholder="Nêu: mục tiêu cần đạt · giới hạn/ràng buộc · điều đã thử"
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
                <div className="mode-picker">
                  <div className="mode-picker-title">Chế độ thảo luận</div>
                  <label className="mode-option">
                    <input type="radio" name="council-mode" checked={topic.mode !== 'fast'} onChange={() => dispatch(topicChanged({ field: 'mode', value: 'deep' }))} />
                    <span><strong>3 vòng đầy đủ</strong> (mặc định, khuyên dùng) — mỗi bot tự đề xuất → nhận xét lẫn nhau → sửa bài. Chất lượng cao nhất cho chủ đề khó.</span>
                  </label>
                  <label className="mode-option">
                    <input type="radio" name="council-mode" checked={topic.mode === 'fast'} onChange={() => dispatch(topicChanged({ field: 'mode', value: 'fast' }))} />
                    <span><strong>1 lượt nối tiếp</strong> (chỉ dùng cho chủ đề dễ) — bot sau đọc bài bot trước rồi bổ sung/sửa, xong sang tổng hợp ngay. Nhanh hơn nhưng mất phần nhận xét chéo.</span>
                  </label>
                </div>
                <button type="button" className="primary big" disabled={!topic.title.trim()} onClick={() => dispatch(startSession())}>
                  Bắt đầu phiên hội đồng
                </button>
              </div>
              <div className="setup-side">
                <div className="setup-side-title">Quy trình 4 bước của phiên</div>
                <div className="setup-preview">
                  {PROCESS_PREVIEW.map((p, i) => (
                    <React.Fragment key={p.name}>
                      <div className="preview-step">
                        <span className="preview-icon" aria-hidden="true">{p.icon}</span>
                        <span><strong>{p.name}</strong><br /><span className="preview-note">{p.note}</span></span>
                      </div>
                      {i < PROCESS_PREVIEW.length - 1 && <div className="preview-arrow" aria-hidden="true">↓</div>}
                    </React.Fragment>
                  ))}
                </div>
                <div className="setup-side-title">Mẫu chủ đề có sẵn — bấm để điền sẵn</div>
                <div className="template-list">
                  {TOPIC_TEMPLATES.map((t) => (
                    <button key={t.label} type="button" className="template-btn" onClick={() => applyTemplate(t)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <FilesPanel />
            <GeminiPanel />
          </section>
        ) : (
          <>
            <section className="browser-area" ref={browserRef}>
              <div className="browser-placeholder">
                {isElectron
                  ? (viewMode === 'tabs'
                    ? `Đang hiển thị tab của ${[...BOTS, SYNTH_BOT].find((b) => b.id === activeBotId)?.name}. Lần đầu dùng, hãy đăng nhập ngay trong tab này — app sẽ nhớ đăng nhập cho lần sau.`
                    : 'Đang hiển thị cả 4 chatbot cùng lúc. Bấm vào thẻ bot ở cột phải để làm việc với từng bot. Tab Muse (tổng hợp) chỉ hiện ở chế độ 1 tab.')
                  : (
                    <div className="open-bots">
                      <p><strong>Bạn đang chạy giao diện bằng trình duyệt thường</strong> nên các chatbot không nhúng trong khung này được (chỉ bản app Electron mới nhúng được). Hãy bấm nút của từng chatbot để mở tab thật, đăng nhập ngay trong tab đó:</p>
                      <div className="open-bots-row">
                        {[...BOTS, SYNTH_BOT].map((b) => (
                          <a key={b.id} className="open-bot-btn" href={b.url} target="_blank" rel="noreferrer">Mở {b.name} ↗</a>
                        ))}
                      </div>
                      <p>Luồng làm việc: bấm “Sao chép lời nhắc” ở vùng thao tác bên phải → sang tab chatbot vừa mở, dán (Ctrl+V) và bấm Gửi → copy đáp án → quay lại đây bấm “Dán câu trả lời về”. Panel này giữ lời nhắc, form, trạng thái và tự chuyển vòng cho bạn.</p>
                    </div>
                  )}
              </div>
            </section>

            <aside className="sidebar">
              <div className="sidebar-tabs" role="tablist" aria-label="Các khu vực của cột thao tác">
                <button type="button" role="tab" aria-selected={sidebarTab === 'actions'} className={sidebarTab === 'actions' ? 'on' : ''} onClick={() => setSidebarTab('actions')}>🎯 Thao tác</button>
                <button type="button" role="tab" aria-selected={sidebarTab === 'files'} className={sidebarTab === 'files' ? 'on' : ''} onClick={() => setSidebarTab('files')}>📁 Tệp</button>
                <button type="button" role="tab" aria-selected={sidebarTab === 'gemini'} className={sidebarTab === 'gemini' ? 'on' : ''} onClick={() => setSidebarTab('gemini')}>
                  🤖 Điều phối{consentPending && <span className="tab-dot" title="Chưa xử lý cảnh báo gửi nội dung lên Gemini API" aria-label="Chưa xử lý cảnh báo Gemini" />}
                </button>
              </div>

              {sidebarTab === 'actions' && (
                <div className="tab-actions">
                  <div className="bot-list">
                    <div className="sidebar-title">Vòng {round} — thao tác cho từng bot</div>
                    {BOTS.map((bot) => (
                      <BotCard
                        key={bot.id}
                        bot={bot}
                        cell={answers[round][bot.id]}
                        isActive={dialogBotId === bot.id}
                        onSelect={() => openBot(bot.id)}
                        onDropFile={handleBotDrop}
                      />
                    ))}
                    <div className="sidebar-title">Tổng hợp</div>
                    <BotCard
                      bot={SYNTH_BOT}
                      cell={synthesis || { status: STATUS.idle, answer: '' }}
                      isActive={dialogBotId === 'muse'}
                      onSelect={() => openBot('muse')}
                      onDropFile={handleBotDrop}
                    />
                  </div>
                  <div className="pinned-area">
                    {renderPinnedDialog()}
                  </div>
                </div>
              )}

              {sidebarTab === 'files' && (
                <div className="tab-scroll">
                  <FilesPanel />
                </div>
              )}

              {sidebarTab === 'gemini' && (
                <div className="tab-scroll">
                  <GeminiPanel />
                </div>
              )}
            </aside>
          </>
        )}
      </div>

      <LogPanel log={log} />
    </div>
  );
}

// Nhat ky thao tac: panel RIENG o day man hinh, rong bang ca cua so (truoc
// day nam chen trong cot phai 380px nen chu bi vo dong, khong doc duoc).
// Mac dinh cao vua phai, bam "Mo rong" de doc thoai mai; co Copy va Xoa.
function LogPanel({ log }) {
  const dispatch = useDispatch();
  const [expanded, setExpanded] = useState(false);
  const copyLog = async () => {
    const text = [...log].reverse().map((e) => `${e.time} — ${e.text}`).join('\n');
    try {
      if (window.councilApi?.clipboardWrite) await window.councilApi.clipboardWrite(text);
      else if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
      dispatch(logAdded('Đã copy toàn bộ nhật ký thao tác vào clipboard.'));
    } catch (_) { /* bo qua */ }
  };
  return (
    <section className={`log-panel ${expanded ? 'expanded' : ''}`}>
      <div className="log-panel-head">
        <span className="log-panel-title">📋 Nhật ký thao tác</span>
        <span className="log-panel-count">{log.length} dòng — mới nhất ở trên</span>
        <div className="log-panel-actions">
          <button type="button" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Thu gọn' : 'Mở rộng'}</button>
          <button type="button" onClick={copyLog} disabled={!log.length}>Copy nhật ký</button>
          <button type="button" onClick={() => { if (window.confirm('Xoá toàn bộ nhật ký thao tác của phiên này?')) dispatch(logCleared()); }} disabled={!log.length}>Xoá</button>
        </div>
      </div>
      <div className="log-panel-body">
        {log.length === 0 && <div className="log-empty">Chưa có thao tác nào.</div>}
        {log.slice(0, 200).map((entry, i) => (
          <div key={i} className="log-item"><span className="log-time">{entry.time}</span><span className="log-text">{entry.text}</span></div>
        ))}
      </div>
    </section>
  );
}
