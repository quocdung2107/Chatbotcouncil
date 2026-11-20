# Giao diện trực quan cho Chat Hội Đồng (Electron + React + Redux Toolkit/Saga)

Thư mục này là **phần giao diện desktop** của công cụ Chat Hội Đồng. Nó thay cho
việc gõ lệnh trong Terminal của bản `hoi_dong.py`: mọi thao tác copy/dán/trạng thái
đều nằm trên **một màn hình duy nhất**.

## Màn hình gồm những gì

- **Khu vực chatbot ở giữa**: 4 chatbot (ChatGPT, Claude, Gemini, Copilot) + tab Muse tổng hợp được nhúng
  thẳng vào app bằng `WebContentsView` của Electron — xem từng tab một, hoặc chuyển
  sang **Lưới 4 ô** (2×2) để thấy cả 4 cùng lúc. Mỗi chatbot có vùng lưu đăng nhập
  riêng (`persist:council-<bot>`), đăng nhập một lần, lần sau mở app vẫn còn.
- **Cột thao tác bên phải**: mỗi bot một thẻ trạng thái
  (Chưa làm → Đã copy prompt → Đã gửi → Đã lưu đáp án) và đúng 3 nút theo thứ tự:
  1. **Copy prompt vòng này** — app tự soạn prompt đúng vai/form của vòng rồi đưa vào clipboard.
  2. **Tôi đã dán + bấm Gửi** — bạn tự dán (Ctrl+V) và bấm Gửi trong tab chatbot, xong bấm nút này.
  3. **⬇ Lấy đáp án từ tab** — bấm 1 nút, app tự đọc khối đáp án mới nhất ngay trong tab chatbot và điền vào ô đáp án (không cần bôi đen + copy nữa). Bạn **đọc lại/sửa trong ô** rồi bấm **Lưu đáp án** mới tính là lưu. Nếu nút này báo không đọc được (trang chatbot đổi giao diện), dùng nút **Dán từ clipboard (dự phòng)**: copy đáp án trong tab như cách cũ rồi bấm — đáp án cũng về ô để bạn duyệt trước khi Lưu. Nút lấy từ tab chỉ có ở bản Electron; bản trình duyệt dùng nút dán.
- **Thanh tiến độ trên đầu**: Vòng 1 đề xuất mù → Vòng 2 phản biện chéo ẩn danh →
  Vòng 3 tác giả sửa bài → **Tổng hợp**. Đủ 4/4 đáp án của một vòng, app tự chuyển vòng.
- **Tab Muse — Tổng hợp (bước cuối, sau vòng 3)**: một tab riêng mở
  [muse.ai](https://muse.ai/) — bạn đăng nhập bằng **tài khoản Muse của chính
  bạn** ngay trong tab (một lần, app nhớ bằng `persist:council-muse` như các bot).
  Muse **không** tranh luận như thành viên thứ 5: khi đủ 12 đáp án, app tự
  chuyển sang bước tổng hợp và chọn sẵn tab Muse. Ở thẻ Muse (cột phải, mục
  "Bước cuối — Tổng hợp") bạn bấm **Copy prompt TỔNG HỢP** — prompt này gói bản
  cuối vòng 3 của cả 4 bot + phản biện vòng 2, và yêu cầu Muse *chốt* một kết
  luận (chọn phương án khi các bài mâu thuẫn, không tóm tắt lần lượt) theo form:
  Kết luận cuối cùng → Điểm thống nhất → Điểm còn tranh cãi và cách xử lý →
  Phương án được chọn → Kế hoạch hành động → Rủi ro còn lại → Việc cần bạn quyết.
  Dán vào tab Muse, bấm Gửi, copy kết luận về như với mọi bot. Tab Muse chỉ
  hiện ở chế độ **1 tab**; lưới 2×2 vẫn dành cho 4 thành viên tranh luận.
  Mẹo: mở thẻ Muse và đăng nhập sẵn ngay từ đầu phiên, để tới bước cuối khỏi chờ.
- **Panel Điều phối Gemini API** (ở màn hình tạo chủ đề và ở cột phải khi phiên
  đang chạy): dán **Gemini API key** của bạn (lấy miễn phí ở Google AI Studio —
  key chỉ lưu trong app trên máy bạn, không vào file phiên, không vào repo) và
  bấm **Kiểm tra kết nối** để chắc chắn key dùng được. Gemini API là *điều phối
  viên* đúng như thiết kế gốc, làm 3 việc: **(1)** đủ 4/4 đáp án vòng 1 thì bấm
  *Tóm tắt vòng 1 → thẻ luận điểm* — prompt vòng 2 sẽ dùng thẻ gọn này (đã ẩn
  danh) thay cho nguyên văn 4 bài; **(2)** *Kiểm tra form* của vòng hiện tại;
  **(3)** đủ đáp án vòng cuối thì bấm *Gói tóm tắt trước tổng hợp* — gói này tự
  kèm vào prompt tổng hợp gửi Muse. Kết quả điều phối cũng được ghi vào thư
  mục phiên (`dieu-phoi/`). Chưa nhập key hoặc API lỗi thì app tự dùng nguyên
  văn đáp án như trước, không kẹt phiên.
- **Nhật ký thao tác**: panel riêng ở **đáy cửa sổ, rộng hết chiều ngang** (không
  còn chen trong cột phải), chữ lớn và giãn dòng dễ đọc, có nút **Mở rộng** để
  xem cao tới ~360px, **Copy nhật ký** và **Xoá**. Nút **Xuất kết quả** lưu toàn
  bộ 12 đáp án thành 1 file Markdown, kèm mục **Kết luận tổng hợp cuối cùng —
  Muse** nếu đã có.
- Phiên làm việc được tự lưu (localStorage của app), tắt app mở lại không mất đáp án.

Prompt, vai trò, form đáp án và cách ẩn danh vòng 2 bám đúng thiết kế của `hoi_dong.py`
ở thư mục gốc của repo (xem `src/lib/council.js`).

## Workflow file trên Windows (gói đầy đủ — chỉ bản Electron)

Thay vì mọi thứ chỉ nằm trong bộ nhớ của app, mỗi phiên hội đồng là **một thư mục
thật trên máy bạn**, và app làm việc trực tiếp với hệ thống file của Windows qua
Electron main process (`electron/fsApi.js`) — React chỉ gọi qua cầu nối an toàn
`window.councilFs` ở preload, không chạm trực tiếp vào ổ đĩa. **3 vòng thảo luận
được giữ nguyên** — workflow file chỉ bỏ phần gom bài/đặt tên/quản lý thủ công,
không cắt vòng nào.

- **Thư mục làm việc**: mặc định `Documents\HoiDong`, đổi được bằng nút
  "Đổi…" trong panel **File & tiến trình** (app nhớ lựa chọn trong file JSON
  dưới userData). Mọi thao tác ghi/xoá của app chỉ diễn ra *trong* thư mục này.
- **Thư mục phiên**: bấm "Bắt đầu phiên hội đồng", app tự tạo thư mục
  `HoiDong\<tên-chủ-đề>/` gồm sẵn:
  - `00-yeu-cau.md` — chủ đề, mục tiêu, tiêu chí (+ ngữ cảnh nếu có nạp file)
  - `00-huong-dan-chung.md` — file "huấn luyện" của hội đồng: cách làm việc
    3 vòng, vai từng bot, quy tắc form/độ tin cậy, kèm 1 ví dụ mẫu đúng form.
    Các chatbot web miễn phí không fine-tune được, nên nội dung cốt lõi của
    file này được app đính vào prompt vòng 1 của mỗi phiên mới.
  - `01-chatgpt/`, `02-claude/`, `03-gemini/`, `04-copilot/` — mỗi bot một
    thư mục riêng, trong đó `vong-1.md`, `vong-2.md`, `vong-3.md` tự ghi ngay
    khi bạn bấm "Lưu đáp án" sau khi lấy/dán đáp án về ô nhập (giữ nguyên 3 vòng × 4 bot)
  - `05-muse/ket-luan-cuoi.md` — kết luận tổng hợp cuối của Muse, và
    `ket-qua-hoi-dong.md` — bản xuất toàn bộ phiên (nút "Xuất kết quả" cũng ghi
    thẳng vào đây khi phiên đã có thư mục; tên file xuất mặc định theo ngày +
    chủ đề khi dùng hộp thoại lưu)
  - `phien.json` — toàn bộ trạng thái phiên để **mở lại phiên cũ** (từ danh
    sách lịch sử hoặc nút "Mở phiên (.json)…" để chọn file)
  - `tien-trinh.md` + `logs/activity.jsonl` — lịch sử tiến trình của phiên
- **Panel tiến trình theo file**: bảng 4 bot × 3 vòng + hàng Muse tổng hợp,
  tính theo file thật trong thư mục phiên (ô nào đã có file sẽ hiện ✓ kèm giờ
  ghi). App theo dõi thư mục bằng `fs.watch` nên file thay đổi là panel tự cập
  nhật. Trong panel còn có: danh sách file của phiên (mở / hiện trong Explorer /
  xoá vào Recycle Bin), **file gần đây**, và **lịch sử các phiên cũ** (bấm
  "Mở lại" để khôi phục đúng trạng thái từ `phien.json`).
- **Nạp file ngữ cảnh**: bấm "Nạp file…" hoặc **kéo-thả file .txt/.md/.json/.csv
  thẳng vào cửa sổ app** — nội dung file tự đính vào prompt vòng 1 và prompt
  tổng hợp, khỏi copy-paste. **Thả file lên thẻ của một bot** thì nội dung file
  đó trở thành đáp án của bot ở vòng hiện tại và được ghi vào thư mục của bot
  (thả lên thẻ Muse thì thành kết luận tổng hợp). File ngoài thư mục làm việc
  chỉ được đọc khi chính bạn chọn qua hộp thoại hoặc kéo-thả vào.
- **Chế độ nhanh (opt-in, chỉ cho chủ đề dễ)**: ở màn hình tạo chủ đề, chọn
  "1 lượt nối tiếp" — bot sau đọc bài bot trước trong cùng vòng 1 rồi bổ sung/
  sửa, đủ 4/4 là sang tổng hợp ngay, không có vòng 2/3. Mặc định vẫn là
  **3 vòng đầy đủ**; chế độ nhanh không thay thế 3 vòng vì đã được kiểm chứng
  là vòng phản biện chéo mới tạo ra các lần tự sửa bài có giá trị.
- **An toàn**: xoá file = đưa vào Recycle Bin (khôi phục được), ghi/xoá bị chặn
  ngoài thư mục làm việc, file đọc vào tối đa 2MB và chỉ nhận định dạng văn bản.
- Chế độ trình duyệt (`npm run dev:renderer`): kéo-thả nạp ngữ cảnh vẫn dùng
  được, nhưng thư mục phiên / lịch sử / Explorer chỉ có ở bản Electron.

## Vì sao vẫn phải dán/Gửi/copy bằng tay?

Các chatbot web miễn phí không cho phép tự động hoá việc gửi/nhận tin (điều khoản
của nhà cung cấp) — app tự bấm Gửi hoặc tự cào đáp án có nguy cơ khoá tài khoản.
Nên app chỉ làm phần "đưa thư": soạn prompt, đưa vào clipboard, nhận đáp án về,
còn 3 động tác trong trang chatbot vẫn do bạn làm. Đây là thiết kế có chủ ý.

## Cách chạy trên Windows (từng bước)

Chuẩn bị: cài **Node.js bản LTS** từ https://nodejs.org (cài xong là có cả `npm`).

Mở thư mục `ui` của repo này trong File Explorer, bấm vào thanh địa chỉ của
File Explorer, gõ `powershell` rồi Enter — một cửa sổ lệnh sẽ mở ngay tại thư mục đó.
Gõ lần lượt 2 lệnh (lần đầu cài thư viện sẽ mất vài phút):

```
npm install
npm run dev
```

App sẽ tự mở. Muốn chạy bản đã build (không cần cửa sổ lệnh của Vite):

```
npm run build
npm start
```

## Cấu trúc thư mục

```
ui/
  electron/
    main.js      — cửa sổ chính, các WebContentsView (4 chatbot + tab Muse tổng hợp), clipboard, hộp thoại lưu file
    fsApi.js     — làm việc với file hệ thống: thư mục làm việc/phiên, ghi file từng đáp án, lịch sử, kéo-thả, Explorer, Recycle Bin, fs.watch
    preload.js   — cầu nối an toàn window.councilApi + window.councilFs cho React
  src/
    lib/council.js       — bot, vai trò, form, hàm soạn prompt, xuất Markdown
    store/councilSlice.js— Redux Toolkit slice: trạng thái phiên, từng ô đáp án
    store/councilSaga.js — Redux Saga: copy prompt, dán đáp án, tự chuyển vòng, xuất file
    store/store.js       — store + tự lưu phiên vào localStorage
    components/          — BotCard (thẻ thao tác), RoundStepper (thanh 3 vòng), FilesPanel (file & tiến trình, lịch sử phiên), GeminiPanel (điều phối Gemini API)
    lib/gemini.js        — prompt điều phối Gemini (thẻ luận điểm, kiểm tra form, gói tổng hợp) + gọi API ở chế độ trình duyệt
    electron/geminiApi.js— IPC gọi Gemini API từ tiến trình chính (bản Electron)
    App.jsx              — bố cục 1 màn hình, đồng bộ vị trí các view với Electron
```

## Giới hạn của bản này và bước tiếp theo

- **Điều phối Gemini API đã có trong giao diện** (xem panel Điều phối ở trên):
  tóm tắt thẻ luận điểm, kiểm tra form, gói tóm tắt trước tổng hợp — gọi qua
  tiến trình chính của Electron (`electron/geminiApi.js`), model mặc định
  `gemini-3.5-flash-lite`, đổi được sang `gemini-3.8-flash` trong panel (Google đã ngừng cấp 2.5 Flash-Lite cho người dùng mới; tên model cũ đã lưu trong app sẽ tự được đổi sang bản mới).
  **Tổng hợp kết luận cuối** vẫn do **Muse** đảm nhiệm qua tab Muse (đúng
  phân vai hiện tại: Gemini điều phối ở giữa, Muse chốt cuối). Bản Python
  `hoi_dong.py` ở thư mục gốc vẫn giữ vai điều phối riêng của nó khi chạy độc lập.
- Hạn mức miễn phí của Gemini API (số lượt/ngày) do Google AI Studio của chính
  tài khoản bạn quyết định; app báo rõ khi bị 429 (hết hạn mức) và tự rơi về
  chế độ nguyên văn, không mất đáp án.
