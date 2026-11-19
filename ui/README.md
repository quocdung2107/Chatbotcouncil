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
  3. **Dán đáp án về** — bạn copy đáp án trong tab chatbot, bấm nút này để app lưu vào đúng ô.
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
- **Nhật ký thao tác** và nút **Xuất kết quả** (lưu toàn bộ 12 đáp án thành 1 file
  Markdown, kèm mục **Kết luận tổng hợp cuối cùng — Muse** nếu đã có).
- Phiên làm việc được tự lưu (localStorage của app), tắt app mở lại không mất đáp án.

Prompt, vai trò, form đáp án và cách ẩn danh vòng 2 bám đúng thiết kế của `hoi_dong.py`
ở thư mục gốc của repo (xem `src/lib/council.js`).

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
    preload.js   — cầu nối an toàn window.councilApi cho React
  src/
    lib/council.js       — bot, vai trò, form, hàm soạn prompt, xuất Markdown
    store/councilSlice.js— Redux Toolkit slice: trạng thái phiên, từng ô đáp án
    store/councilSaga.js — Redux Saga: copy prompt, dán đáp án, tự chuyển vòng, xuất file
    store/store.js       — store + tự lưu phiên vào localStorage
    components/          — BotCard (thẻ thao tác), RoundStepper (thanh 3 vòng)
    App.jsx              — bố cục 1 màn hình, đồng bộ vị trí các view với Electron
```

## Giới hạn của bản này (v1) và bước tiếp theo

- Điều phối bằng **Gemini API** (tóm tắt thành thẻ luận điểm, chuẩn hoá form)
  hiện vẫn nằm ở bản Python `hoi_dong.py` ở thư mục gốc.
  Bản giao diện này chưa gọi Gemini API — vòng 2 dùng nguyên văn đáp án vòng 1
  (đã ẩn danh) thay cho thẻ luận điểm rút gọn. Riêng **tổng hợp kết luận cuối**
  nay đã có trong giao diện, do **Muse** đảm nhiệm qua tab Muse ở trên
  (bán tự động copy/dán như các bot, không qua API).
- Bước tiếp theo nếu cần: nối hai phần lại — Electron gọi các hàm điều phối
  (plan / normalize / finalize) qua Gemini API ngay trong app, hoặc chạy
  `hoi_dong.py` làm tiến trình con phía sau giao diện.
