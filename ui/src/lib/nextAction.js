// State machine o (bot x vong) + Next Action (Muc 3.1/3.2/3.3 cua thiet ke
// da chot). Ham thuan — nhan trang thai o da chuan hoa, tra ve dung 1 hanh
// dong tiep theo quan trong nhat. Khong phu thuoc Redux/DOM de test duoc.

export const CELL_STATUS = {
  NOT_READY: 'NOT_READY',
  PROMPT_READY: 'PROMPT_READY',
  FILLED: 'FILLED',
  WAITING: 'WAITING',
  LIKELY_DONE: 'LIKELY_DONE',
  FETCHED: 'FETCHED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  SAVED: 'SAVED',
  SKIPPED: 'SKIPPED',
  ERROR: 'ERROR',
};

// Anh xa tu o dap an hien co trong councilSlice (status kieu cu:
// idle/prompt_ready/sent/fetched/saved + co the co skipped/error/confidence)
// sang trang thai may V3. Khong pha format file cu.
export function deriveCellStatus(cell) {
  if (!cell) return CELL_STATUS.NOT_READY;
  if (cell.status === 'skipped' || cell.skipped) return CELL_STATUS.SKIPPED;
  if (cell.status === 'saved') return CELL_STATUS.SAVED;
  if (cell.needsReview) return CELL_STATUS.NEEDS_REVIEW;
  if (cell.error) return CELL_STATUS.ERROR;
  if (cell.status === 'fetched') return CELL_STATUS.FETCHED;
  if (cell.likelyDone) return CELL_STATUS.LIKELY_DONE;
  if (cell.status === 'sent') return CELL_STATUS.WAITING;
  if (cell.filled) return CELL_STATUS.FILLED;
  if (cell.status === 'prompt_ready') return CELL_STATUS.PROMPT_READY;
  return CELL_STATUS.NOT_READY;
}

// Dong vong: moi o deu SAVED hoac SKIPPED. Du dieu kien di tiep: dong vong
// VA toi thieu 2 bot SAVED (Muc 3.3 — duoi 2 dap an thi ket luan qua mong).
export function roundClosure(cells, botIds) {
  const ids = botIds && botIds.length ? botIds : Object.keys(cells || {});
  let saved = 0;
  let skipped = 0;
  let pending = 0;
  for (const id of ids) {
    const st = cells?.[id]?.status || deriveCellStatus(cells?.[id]);
    if (st === CELL_STATUS.SAVED) saved += 1;
    else if (st === CELL_STATUS.SKIPPED) skipped += 1;
    else pending += 1;
  }
  const closed = pending === 0 && ids.length > 0;
  return { closed, saved, skipped, pending, canProceed: closed && saved >= 2 };
}

// cells: { [botId]: { status: CELL_STATUS, reason?, confidence? } } cua VONG
// hien tai. botOrder: [{id, name}] theo thu tu uu tien hien thi.
// Tra ve { kind, botId, text } — kind: error|review|fetched|likely_done|
// prompt_ready|blocked|advance|synthesis|working|idle
export function computeNextAction({ cells, round, botOrder, phase } = {}) {
  const order = botOrder && botOrder.length ? botOrder : Object.keys(cells || {}).map((id) => ({ id, name: id }));
  const byStatus = (st) => order.find((b) => (cells?.[b.id]?.status || deriveCellStatus(cells?.[b.id])) === st);

  const errBot = byStatus(CELL_STATUS.ERROR);
  if (errBot) {
    const reason = cells[errBot.id]?.reason || cells[errBot.id]?.error || 'lỗi không rõ';
    return { kind: 'error', botId: errBot.id, text: `⚠ ${errBot.name} — Vòng ${round} bị lỗi: ${reason}. Bấm để mở xử lý.` };
  }
  const reviewBot = byStatus(CELL_STATUS.NEEDS_REVIEW);
  if (reviewBot) {
    const reason = cells[reviewBot.id]?.reason || 'bị gắn cờ cần xem lại';
    return { kind: 'review', botId: reviewBot.id, text: `${reviewBot.name} — Vòng ${round} ${reason}. Bấm để xem và sửa.` };
  }
  const fetchedBot = byStatus(CELL_STATUS.FETCHED);
  if (fetchedBot) {
    const conf = cells[fetchedBot.id]?.confidence;
    const confText = conf != null ? ` (điểm tin cậy: ${conf})` : '';
    return { kind: 'fetched', botId: fetchedBot.id, text: `${fetchedBot.name} — Vòng ${round} đang chờ bạn duyệt đáp án${confText}.` };
  }
  const doneBot = byStatus(CELL_STATUS.LIKELY_DONE);
  if (doneBot) {
    return { kind: 'likely_done', botId: doneBot.id, text: `${doneBot.name} — Vòng ${round} có vẻ đã trả lời xong (ước đoán). Bấm Lấy đáp án.` };
  }
  const readyBot = byStatus(CELL_STATUS.PROMPT_READY) || byStatus(CELL_STATUS.FILLED);
  if (readyBot) {
    return { kind: 'prompt_ready', botId: readyBot.id, text: `${readyBot.name} — Vòng ${round}: bấm Dán lời nhắc vào trang, rồi tự bấm Gửi trong trang chatbot.` };
  }

  const closure = roundClosure(cells, order.map((b) => b.id));
  if (closure.closed) {
    if (!closure.canProceed) {
      return { kind: 'blocked', botId: '', text: `Vòng ${round} đã đóng nhưng mới có ${closure.saved} đáp án đã lưu — cần tối thiểu 2 đáp án để tiếp tục. Hãy bỏ Skip bớt hoặc lấy thêm đáp án.` };
    }
    if (round >= 3 || phase === 'synthesis') {
      return { kind: 'synthesis', botId: 'muse', text: 'Đã đủ điều kiện — chuyển sang bước TỔNG HỢP cuối cùng ở thẻ Muse.' };
    }
    return { kind: 'advance', botId: '', text: `Vòng ${round} đã đủ (${closure.saved} đã lưu${closure.skipped ? `, ${closure.skipped} bỏ qua` : ''}) — sẵn sàng mở Vòng ${round + 1}.` };
  }

  const waitingBot = byStatus(CELL_STATUS.WAITING);
  if (waitingBot) {
    return { kind: 'working', botId: waitingBot.id, text: `${waitingBot.name} — Vòng ${round} đang chờ bot trả lời. Khi bot gõ xong, bấm "Lấy câu trả lời về" ở bước ③ trong vùng thao tác của bot.` };
  }
  const firstPending = order.find((b) => {
    const st = cells?.[b.id]?.status || deriveCellStatus(cells?.[b.id]);
    return st !== CELL_STATUS.SAVED && st !== CELL_STATUS.SKIPPED;
  });
  if (firstPending) {
    return { kind: 'prompt_ready', botId: firstPending.id, text: `${firstPending.name} — Vòng ${round}: mở vùng thao tác của bot để dán lời nhắc vòng này.` };
  }
  return { kind: 'idle', botId: '', text: 'Chưa có việc nào đang chờ.' };
}
