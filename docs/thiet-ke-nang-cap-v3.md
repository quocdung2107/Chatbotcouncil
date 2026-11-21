# Thiết kế nâng cấp Hội Đồng V3 — bản đã chốt qua hội đồng 2026-11-21

> Trạng thái: **ĐÃ CHỐT**, sẵn sàng để code theo.
> Hai quyết định của người dùng đã khoá trong phiên tổng hợp 2026-11-21:
> 1. **Chấp nhận cảnh báo gửi nội dung lên Gemini API** — nhóm (b) bán tự động: cảnh báo + xác nhận 1 lần/phiên, được tắt hẳn điều phối.
> 2. **Skip bot là tính năng chính thức** — trạng thái `SKIPPED` ghi vào file phiên, vòng chạy tiếp với các bot còn lại, Muse tổng hợp phải nêu rõ bot bị thiếu.
>
> Tên phương án: **"Extractor v3 đáng tin cậy trước, Workflow có Next Action sau"**.

---

## 0. Nguyên tắc không đổi (ràng buộc cứng)

- Bán tự động là cố ý: app **không** tự bấm Send, **không** dán/lấy hàng loạt, **không** bypass CAPTCHA/Cloudflare. 1 click = đúng 1 bot.
- Chế độ sâu 3 vòng là mặc định. Không cắt vòng để lấy tốc độ.
- API key chỉ ở localStorage trên máy người dùng. Không bao giờ vào `phien.json`, file export, hay repo.
- Mọi điều khiển nằm ở top bar / sidebar / bottom panel / cửa sổ nổi — không đặt vào vùng bị WebContentsView che.
- Không thêm thư viện/phụ thuộc mới trong MVP. Dùng đúng stack hiện có: Electron 45, React, Redux Toolkit + Saga, localStorage.

---

## 1. Kiến trúc tổng thể sau nâng cấp

```
┌─────────────────────────────────────────────────────────────┐
│ TOP BAR: NextActionBar — luôn chỉ hiện ĐÚNG 1 việc tiếp theo │
├──────────────┬──────────────────────────────────────────────┤
│ SIDEBAR      │  Vùng WebContentsView (tab chatbot)          │
│ - Ma trận    │  (không đặt điều khiển ở đây)                │
│   trạng thái │                                              │
│   4 bot ×    │                                              │
│   3 vòng     │                                              │
│ - BotDialog  │                                              │
│ - GeminiPanel│                                              │
├──────────────┴──────────────────────────────────────────────┤
│ BOTTOM: Log full-width (giữ nguyên như hiện tại)            │
└─────────────────────────────────────────────────────────────┘

Luồng dữ liệu:  Extractor v3 → Confidence Score → người dùng duyệt
                → Quality Gate (Gemini API) → file phiên → vòng sau
```

Ba lớp mới, theo đúng thứ tự phụ thuộc đã chốt:

| Lớp | Vai trò | File chính |
|---|---|---|
| 1. Extractor v3 | Lấy đáp án + chấm điểm tin cậy + fallback nhiều tầng | `ui/electron/answerExtract.js` (viết lại), `ui/src/lib/answerSettings.js` (mở rộng) |
| 2. Workflow Engine | State machine bot × vòng × bước + Next Action + Skip | `ui/src/store/councilSlice.js`, `ui/src/store/councilSaga.js`, mới: `ui/src/lib/nextAction.js`, `ui/src/components/NextActionBar.jsx` |
| 3. Quality Gate | Gemini kiểm định chất lượng vòng, cờ NEEDS_REVIEW, prompt sửa | `ui/src/lib/gemini.js`, `ui/electron/geminiApi.js`, `ui/src/components/GeminiPanel.jsx` |

---

## 2. Lớp 1 — Extractor v3 (làm TRƯỚC TIÊN)

### 2.1. Hình dạng kết quả mới

`answerExtract.js` hiện trả về text. V3 trả về một object:

```js
{
  text,            // nội dung lấy được (có thể rỗng)
  confidence,      // 0–100, xem cách chấm ở 2.2
  breakdown,       // { strategy, length, stability, duplicate, headings, stopVisible }
  strategy,        // tầng fallback nào lấy được: 'custom' | 'default' | 'scan' | 'deep' | 'pick'
  candidates       // khi confidence < 60: danh sách khối ứng viên để người dùng pick
}
```

### 2.2. Cách chấm Confidence Score (tổng 100)

| Tiêu chí | Điểm | Cách đo |
|---|---|---|
| Đúng tầng selector tin cậy | 0–25 | custom đã xác nhận = 25, default = 18, scan = 10, deep/smart-scan = 5 |
| Độ dài hợp lý | 0–20 | ≥ 200 ký tự = 20; 80–199 = 12; 20–79 = 5; < 20 = 0 |
| Ổn định qua 2 lần đọc | 0–25 | Đọc 2 lần cách nhau ~1,2 giây: giống ≥ 98% = 25; 90–97% = 12; < 90% = 0 (bot có thể vẫn đang gõ) |
| Không trùng đáp án cũ | 0–15 | Khác đáp án vòng trước / lượt lấy trước của chính bot đó = 15; trùng ≥ 95% = 0 |
| Có cấu trúc mẫu | 0–10 | Có đủ các tiêu đề mục bắt buộc của mẫu vòng hiện tại = 10, thiếu 1 mục trừ 3 |
| Không còn dấu hiệu đang gõ | 0–5 | Không thấy nút Stop / spinner của site = 5; còn thấy = 0 |

Ngưỡng xử lý (đã chốt):

- **90–100 — Tin cậy cao:** hiện ô duyệt, nút "Lưu đáp án" bật sẵn, người dùng chỉ cần lướt và bấm Lưu.
- **60–89 — Cần kiểm tra:** ô duyệt viền vàng, dòng cảnh báo ghi rõ tiêu chí nào mất điểm (ví dụ "Nội dung thay đổi giữa 2 lần đọc — bot có thể chưa gõ xong").
- **< 60 — Không cho lưu chính thức:** không đổ vào ô đáp án; mở danh sách `candidates` ngay trong BotDialog để người dùng pick lại vùng đúng.

> Score là điểm tin cậy của *phép trích xuất*, không phải xác suất đúng tuyệt đối. UI phải ghi chú câu này ở lần đầu người dùng thấy điểm số.

### 2.3. Fallback nhiều tầng (thứ tự cố định)

1. Selector custom đã lưu (localStorage, key hiện tại `hoi-dong-answer-selectors`).
2. Selector mặc định theo site.
3. `scan-candidates` — chấm điểm từng khối, lấy khối cao nhất.
4. Deep scan xuyên Shadow DOM + deep-text (giữ nguyên của V2).
5. Vẫn < 60 → trả `candidates` về renderer, người dùng pick trên trang thật (dùng lại `views:start-pick` sẵn có).

### 2.4. Dấu vân tay selector (selector fingerprint)

Khi người dùng xác nhận 1 selector (pick hoặc chọn từ scan), lưu kèm:

```js
// localStorage key: hoi-dong-answer-selectors (mở rộng schema)
{ selector, fingerprint: { length, head80 }, confirmedAt, site }
```

Lần lấy sau: nếu khối khớp selector nhưng `head80` và độ dài lệch hẳn so với nội dung kỳ vọng của *lượt hiện tại* (trùng đáp án cũ), trừ điểm ở tiêu chí "Không trùng đáp án cũ" thay vì báo đúng. Selector cũ **không bao giờ bị tự ghi đè** — chỉ thay khi người dùng xác nhận selector mới.

### 2.5. Kiểm tra trạng thái "đã gõ xong" — theo yêu cầu, KHÔNG quan sát nền

Đã loại bỏ MutationObserver liên tục. Chỉ kiểm tra tại 2 thời điểm: người dùng mở tab bot đó, hoặc bấm "Lấy đáp án". Điều kiện gán nhãn **"Nghi ngờ đã xong (ước đoán)"**:

- Không thấy nút Stop của site, **và**
- Độ dài text ổn định qua 2 lần đọc cách ~1,2 giây (chính là tiêu chí ổn định ở 2.2).

Nhãn trên UI luôn kèm chữ **"ước đoán"**. Trạng thái này không tự lưu, không tự chuyển vòng.

---

## 3. Lớp 2 — Workflow Engine: State Machine + Next Action + Skip

### 3.1. Trạng thái cho mỗi ô (bot × vòng)

```
NOT_READY      Chưa chuẩn bị prompt
PROMPT_READY   Prompt đã sẵn sàng trong BotDialog
FILLED         Đã dán vào ô nhập (chờ người dùng tự bấm Send trên trang)
WAITING        Đã gửi, chờ bot trả lời
LIKELY_DONE    Nghi ngờ đã xong (ước đoán — xem 2.5)
FETCHED        Đã lấy đáp án về, chờ duyệt (kèm confidence)
NEEDS_REVIEW   Gemini gắn cờ sai mẫu/hỏi lại/lạc đề (xem Lớp 3)
SAVED          Đã lưu file vong-X.md
SKIPPED        Người dùng bấm Bỏ qua (chính thức — xem 3.3)
ERROR          Lỗi đăng nhập / lỗi trang / lấy đáp án thất bại
```

Lưu trong Redux theo khoá `state.cells[botId][round]`, và persist các trạng thái bền (`SAVED`, `SKIPPED`, `NEEDS_REVIEW` + lý do) vào `phien.json` để khôi phục phiên đúng như cũ.

### 3.2. Next Action Bar (top bar)

Hàm thuần `nextAction.js`: đầu vào là toàn bộ `cells` + vòng hiện tại, đầu ra là **đúng 1** hành động theo thứ tự ưu tiên:

1. Có ô `ERROR` → "⚠ [Bot] — Vòng [X] bị lỗi: [lý do ngắn]. Bấm để mở xử lý."
2. Có ô `NEEDS_REVIEW` → "[Bot] — Vòng [X] bị gắn cờ: [lý do]. Xem prompt sửa."
3. Có ô `FETCHED` → "[Bot] — Vòng [X] đang chờ bạn duyệt đáp án (điểm tin cậy: N)."
4. Có ô `LIKELY_DONE` → "[Bot] — Vòng [X] có vẻ đã trả lời xong. Bấm Lấy đáp án."
5. Có ô `PROMPT_READY` → "[Bot] — Vòng [X]: bấm Dán prompt, rồi tự bấm Send trên trang."
6. Mọi ô của vòng đều `SAVED`/`SKIPPED` → "Đủ điều kiện mở Vòng [X+1]" (hoặc "Chuẩn bị tổng hợp Muse" sau vòng 3).

Nút trên thanh chỉ **điều hướng** (mở đúng BotDialog/tab của bot đó) — không tự thực hiện thao tác lên trang chatbot. Nhãn BotDialog và ô duyệt luôn gắn cố định **[Vòng X — Tên Bot]**, và nút Lưu cảnh báo khi file đích đã tồn tại (chống bấm nhầm vòng/bot, điểm đau B).

### 3.3. Skip bot — tính năng chính thức (đã chốt)

- Nút "Bỏ qua bot này ở vòng này" trong BotDialog, bấm → hộp xác nhận 1 lần → trạng thái `SKIPPED`.
- Ghi vào `phien.json`: `{ bot, round, skippedAt, reason? }` (reason tuỳ chọn, người dùng gõ hoặc để trống), và 1 dòng trong `tien-trinh.md`.
- Điều kiện đóng vòng: mọi ô đều `SAVED` hoặc `SKIPPED`. **Tối thiểu 2 bot `SAVED`** mới được mở vòng sau / đi tổng hợp; dưới 2 thì Next Action Bar báo rõ "Chưa đủ đáp án để tiếp tục".
- Gemini điều phối tự loại bot đã Skip khi chuẩn bị prompt vòng sau.
- Prompt tổng hợp Muse **bắt buộc** có dòng mở đầu: "Phiên này thiếu: [Bot] (bỏ qua ở vòng [X])" — và kết luận Muse phải ghi điều này trong mục "Điểm bất đồng còn lại / hạn chế".

### 3.4. Kiểm tra toàn vẹn prompt vòng 2 (chặn ca "hỏi lại")

Trước khi cho bấm "Dán prompt" ở vòng 2, saga kiểm tra prompt đã chứa đủ mã luận điểm ẩn danh (ví dụ `L-A, L-B, L-C, L-D`) và đủ 4 tiêu chí chấm. Thiếu → báo lỗi ngay trong BotDialog, không cho dán. Đây là chốt chặn cho ca thật đã xảy ra: ChatGPT ở vòng 2 hỏi lại "phản biện mã nào" vì không thấy mã.

Tương tự ở vòng 3: prompt phải chứa dòng đối chiếu "đã đổi / không đổi vì…" cho từng điểm vòng 2.

---

## 4. Lớp 3 — Quality Gate: Gemini API (nhóm b — đã chốt cảnh báo)

### 4.1. Cảnh báo gửi dữ liệu — 1 lần/phiên

- Lần gọi Gemini API **đầu tiên trong mỗi phiên**: hiện hộp cảnh báo trong GeminiPanel —
  *"Bước này sẽ gửi chủ đề và các đáp án của phiên lên Gemini API (gói miễn phí) để điều phối. Nội dung có thể được Google xử lý theo điều khoản gói miễn phí. API key không bị gửi kèm nội dung và không lưu vào file phiên."* — nút **Đồng ý, tiếp tục** / **Tắt điều phối phiên này**.
- Cờ đồng ý lưu theo phiên (`session.geminiConsent = true` trong Redux + `phien.json` chỉ lưu `geminiConsent: true/false`, **không** lưu nội dung đã gửi). Phiên mới = hỏi lại từ đầu.
- Tắt điều phối → app chạy chế độ thủ công: người dùng tự tạo thẻ luận điểm từ mẫu có sẵn trong panel (form dự phòng), quy trình 3 vòng không đổi.

### 4.2. Ba việc của Quality Gate (chỉ gắn cờ, không sửa gốc)

Sau khi 1 vòng đủ `SAVED` (hoặc người dùng bấm "Kiểm tra vòng này"):

1. **Kiểm mẫu:** đủ mục bắt buộc không, vượt độ dài không.
2. **Phát hiện lỗi nhiệm vụ:** trả lời bằng câu hỏi làm rõ, từ chối nhiệm vụ, lạc vai trò, bỏ trống luận điểm.
3. **Đối chiếu chéo:** mâu thuẫn và trùng lặp giữa các bot (phục vụ thẻ luận điểm vòng 2).

Kết quả: bot đạt → giữ `SAVED`; bot lỗi → `NEEDS_REVIEW` + lý do cụ thể + **prompt sửa sẵn** trong BotDialog (người dùng bấm fill lại như prompt thường, 1 bot 1 lần). File gốc **không bị sửa**; kết quả kiểm định ghi vào thư mục `dieu-phoi/` như hiện tại, cộng thêm `kiem-dinh-vong-X.md`.

### 4.3. Khi API lỗi / hết quota

Bắt lỗi 429/timeout → tự chuyển phiên sang chế độ thủ công (4.1), log rõ lý do bằng tiếng Việt dễ hiểu, **không** kẹt vòng, không thử lại liên tục.

### 4.4. Mẫu tổng hợp Muse (ép cấu trúc quyết định)

Prompt tổng hợp gắn kèm gói tóm tắt của Gemini và ép Muse trả đúng 4 khối:

1. **Quyết định đề xuất** — 1 phương án chọn rõ ràng, không liệt kê song song.
2. **Điều kiện áp dụng** — khi nào quyết định này đúng / không còn đúng.
3. **Điểm bất đồng còn lại** — gồm cả bot bị Skip và điểm chưa kiểm chứng.
4. **Việc cần làm tiếp theo** — bước cụ thể, làm được ngay.

---

## 5. UI/UX — thay đổi cụ thể

| Hạng mục | Hiện tại | V3 |
|---|---|---|
| Thanh việc tiếp theo | Không có, người dùng tự nhớ | **NextActionBar ở top bar**, 1 hành động duy nhất (3.2) |
| Trạng thái bot × vòng | Panel Files (ma trận file) | Giữ Panel Files + thêm **chấm màu trạng thái theo state machine** ngay trên thẻ bot ở sidebar: xám = chưa sẵn sàng, xanh dương = đang chờ, vàng = chờ duyệt/cần kiểm tra, xanh lá = đã lưu, xám gạch chéo = đã bỏ qua, đỏ = lỗi. Nhãn tiếng Việt, luôn kèm chữ, không chỉ dựa vào màu |
| Ô duyệt đáp án | Text + nút Lưu | Thêm **thanh điểm tin cậy** (số + vạch màu + lý do mất điểm), nhãn cố định [Vòng X — Bot] |
| BotDialog | Mọi thao tác của bot | Thêm: nút Bỏ qua (3.3), mục NEEDS_REVIEW + prompt sửa, danh sách candidates khi confidence < 60 |
| GeminiPanel | Nhập key + test kết nối | Thêm hộp cảnh báo lần đầu/phiên (4.1) + nút tắt điều phối + form thẻ luận điểm thủ công khi tắt/lỗi |
| So sánh 4 đáp án | Chưa có | **V3 dài hạn:** cửa sổ nổi BrowserWindow riêng — không làm trong MVP/V2 |

Phím tắt (chỉ trong app, không thao tác lên trang chatbot): `Ctrl+1..5` chuyển bot, `Ctrl+L` lấy đáp án của bot đang chọn. Làm ở V2.

---

## 6. Thay đổi dữ liệu

`phien.json` — thêm, không phá trường cũ:

```jsonc
{
  "cells": { "chatgpt": { "1": { "status": "SAVED", "confidence": 93 },
                          "2": { "status": "SKIPPED", "skippedAt": "...", "reason": "" } } },
  "geminiConsent": true,
  "qualityGate": { "round1": { "chatgpt": { "verdict": "NEEDS_REVIEW", "reasons": ["..."] } } }
}
```

localStorage — mở rộng `hoi-dong-answer-selectors`: thêm `fingerprint` + `confirmedAt` (2.4). Key Gemini giữ nguyên cơ chế hiện tại.

---

## 7. Lộ trình làm

**MVP — 1 tuần (làm và kiểm chứng được):**
1. Extractor v3: object kết quả + Confidence Score + fallback 5 tầng (Mục 2).
2. Ô duyệt hiển thị điểm tin cậy + lý do mất điểm; chặn lưu khi < 60, mở candidates.
3. State machine 10 trạng thái + NextActionBar ở top bar + nhãn [Vòng X — Bot] chống nhầm.
4. Skip chính thức: nút, xác nhận, ghi `phien.json`/`tien-trinh.md`, điều kiện tối thiểu 2 bot SAVED.
5. Cảnh báo Gemini 1 lần/phiên + tắt điều phối → chế độ thủ công.
6. Kiểm tra toàn vẹn prompt vòng 2/3 trước khi cho dán (3.4).

**V2 — 1 tháng:**
7. Quality Gate đầy đủ: kiểm mẫu + phát hiện hỏi lại/từ chối + prompt sửa 1 click (4.2), dự phòng hết quota (4.3).
8. Dấu vân tay selector hoàn chỉnh; mẫu tổng hợp Muse 4 khối (4.4); phím tắt trong app.

**V3 — dài hạn:**
9. Cửa sổ so sánh 4 đáp án (BrowserWindow nổi); mẫu chủ đề có sẵn; đo click/thời gian thật để tối ưu tiếp.

---

## 8. Kế hoạch kiểm chứng (bắt buộc trước khi coi MVP xong)

1. **Bảng test trang thật:** file `docs/bang-kiem-chung-extractor.md` trong repo — lưới site × selector × ngày, 5 trang đã đăng nhập (ChatGPT, Claude, Gemini, Copilot, Muse), mỗi site tối thiểu 20 lần lấy đáp án.
2. **Ca khó bắt buộc:** bot ngừng gõ 3–10 giây rồi gõ tiếp; đáp án trùng đáp án cũ; selector bị cố ý làm sai; bot hỏi lại thay vì trả lời; 1 bot bị Skip từ vòng 1.
3. **Tiêu chí đạt MVP:** lấy đúng ≥ 18/20 lần/site ở tầng custom/default; 0 lần tự lưu sai vòng/bot trong 1 phiên chạy trọn 3 vòng; phiên có Skip vẫn ra được kết luận Muse có ghi rõ bot thiếu.

## 9. Rủi ro còn lại (giữ nguyên từ tổng hợp, chưa được giải quyết bởi thiết kế này)

- Mọi ngưỡng điểm (90/60, 1,2 giây, 98%) là **suy luận chưa đo** — phải hiệu chỉnh sau bảng test Mục 8.
- Điều khoản dữ liệu hiện hành của Gemini API gói miễn phí chưa kiểm chứng được; cảnh báo 4.1 giảm rủi ro nhưng không loại bỏ.
- Chất lượng kết luận khi Skip còn 2–3 bot: chưa đo, chỉ mới có cơ chế ghi rõ.
- DOM các site đổi là gãy lại — thiết kế này giảm thiệt hại (fallback + pick) chứ không tránh được.
