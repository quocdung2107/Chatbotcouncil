# Công cụ Chat Hội Đồng — MVP chạy được ngay

Bản thiết kế đầy đủ: `../hoi-dong-chatbot-thiet-ke-vong-session-form.md`
Code chính: `hoi_dong.py` — chỉ dùng thư viện chuẩn của Python, **không cần `pip install` gì thêm**.

## Nó làm gì (nói gọn)

- Bạn hỏi 1 chủ đề → 4 chatbot miễn phí (ChatGPT, Claude, Gemini web, Copilot) thảo luận 3 vòng:
  **Vòng 1** đề xuất mù (không thấy nhau) → **Vòng 2** phản biện chéo ẩn danh → **Vòng 3** tự sửa bài.
- Mỗi vòng, mỗi bot = **1 session mới** trên web. Bạn tự mở New chat, dán prompt, bấm Gửi, copy đáp án về.
- Code chỉ làm 3 việc: chuẩn bị prompt đúng vai + đúng form, lưu đáp án vào SQLite (`hoi_dong.db`),
  và gọi Gemini API (miễn phí) để gom thành thẻ luận điểm + tổng hợp kết luận cuối.
- Tổng cộng 12 lần dán + 12 lần copy cho 1 chủ đề. Không thêm vòng nếu không cần.

## ⚠️ Điều quan trọng nhất: đừng tự động hoá phần bấm Gửi

Code **không** tự dán, tự bấm Gửi, tự copy đáp án từ web ChatGPT / Claude / Gemini miễn phí.
Cách thao tác không quyết định có vi phạm hay không — điều khoản nhìn vào việc có
*truy cập tự động* hay không, và các nhà cung cấp cấm truy cập bằng bot/script ngoài API/CLI
chính thức. Tự động hoá giao diện web miễn phí = rủi ro khoá tài khoản.

Vì vậy MVP này là **bán tự động, người bấm Gửi**: code chuẩn bị prompt vào clipboard,
bạn dán + Gửi, rồi copy đáp án về cho code lưu. Bạn chỉ còn 2 thao tác/hộp/vòng,
thay vì tự nhớ ai nói gì và tự ghép ngữ cảnh — đó mới là phần mệt nhất.

Muốn tự động 100% thì chỉ dùng kênh được phép: API chính thức, CLI chính thức,
hoặc model local (Ollama).

## Chuẩn bị (làm 1 lần)

### 1. Mở Terminal trên Windows
Nhấn phím **Windows** → gõ `Terminal` → Enter.

### 2. Tải code về máy
Copy cả thư mục `hoi-dong-chatbot` (file `hoi_dong.py` + file này) về máy Windows của bạn,
ví dụ vào `C:\hoi-dong-chatbot`. Trong Terminal gõ:
```
cd C:\hoi-dong-chatbot
```

### 3. Lấy key Gemini miễn phí (khuyên dùng, để có đủ 3 hàm điều phối)
1. Mở https://aistudio.google.com/ → đăng nhập tài khoản Google.
2. Bấm **Get API Key** → **Create API Key** → copy key.
3. Trong Terminal (cùng cửa sổ sẽ chạy tool), gõ — thay `KEY-CUA-BAN` bằng key thật:
```
set GEMINI_API_KEY=KEY-CUA-BAN
```
Lưu ý: lệnh `set` chỉ có hiệu lực trong cửa sổ Terminal đó. Mở cửa sổ mới thì gõ lại.
Key này **không** đưa cho ai, không dán vào file chat, không đẩy lên GitHub.

Chưa có key vẫn chạy thử được: tool chuyển sang chế độ fallback (vai mẫu có sẵn,
gom thẻ luận điểm đơn giản, tổng hợp bằng cách ghép các thẻ lại). Kết quả kém hơn
bản dùng API, nhưng đủ để chạy thử trọn 1 chủ đề.

Kiểm tra quota thật của project bạn: AI Studio → **Rate limits**.
Mẹo tiết kiệm: tool dùng model Flash-Lite cho khâu chuẩn hoá, để dành Flash cho tổng hợp cuối.
Gặp lỗi 429 (hết quota tạm thời) thì tool tự đợi rồi thử lại — đừng tạo thêm key/project để lách.

## Chạy thử 1 chủ đề (khoảng 15–20 phút thao tác tay)

```
python hoi_dong.py new "Co nen mo quan ca phe nho o Ha Noi khong?"
python hoi_dong.py status
```

Rồi lặp lại cho từng bot, từng vòng:
```
python hoi_dong.py next
```
- Tool in prompt ra màn hình, đồng thời copy vào clipboard và ghi ra file `prompt.txt`
  (nếu clipboard tự động không chạy trên máy bạn, mở `prompt.txt`, Ctrl+A, Ctrl+C).
- Mở trình duyệt, vào đúng bot đó, bấm **New chat**, dán (Ctrl+V), bấm **Gửi**.
- Chờ bot trả lời xong, bôi chọn toàn bộ đáp án, copy (Ctrl+C), rồi:
```
python hoi_dong.py save
```
- Nếu `save` báo không đọc được clipboard: dán đáp án vào file `dap_an.txt`, lưu lại,
  rồi chạy `python hoi_dong.py save` một lần nữa.

Sau khi đủ 4 đáp án của 1 vòng, gom vòng đó (Gemini gọi **1 lần** cho cả 4 bài):
```
python hoi_dong.py normalize
```
Rồi chạy `next` để sang vòng sau. Hết 3 vòng (12 đáp án) thì:
```
python hoi_dong.py finalize
```
Kết luận cuối được ghi ra file `ket-luan-T01.md` (số T tăng theo từng chủ đề).

## Các lệnh

| Lệnh | Làm gì |
|---|---|
| `python hoi_dong.py new "Chủ đề..."` | Tạo chủ đề mới (Vòng 0: Gemini lập kế hoạch, chia vai) |
| `python hoi_dong.py next` | Lấy prompt tiếp theo (vòng + bot tiếp theo) vào clipboard |
| `python hoi_dong.py save` | Lưu đáp án đang ở clipboard vào đúng ô (chủ đề/vòng/bot) |
| `python hoi_dong.py normalize` | Gom 1 vòng đủ 4 đáp án thành thẻ luận điểm |
| `python hoi_dong.py finalize` | Tổng hợp kết luận cuối sau đủ 12 đáp án |
| `python hoi_dong.py status` | Xem đang ở vòng nào, bot nào, còn thiếu gì |

## File nào lưu ở đâu

- `hoi_dong.db` — SQLite: bảng `topics`, `rounds`, `sessions`, `answers`, `packets`
  (đúng schema trong bản thiết kế, mục 6). Đây là **bộ nhớ thật** của hội đồng.
  Xoá file này = bắt đầu lại từ đầu.
- `prompt.txt` — prompt vừa lấy bằng `next` (để copy tay khi clipboard tự động không chạy).
- `dap_an.txt` — chỗ dán đáp án bằng tay khi `save` không đọc được clipboard.
- `ket-luan-T01.md` — kết luận cuối của từng chủ đề.

## Giới hạn của MVP này (chưa làm)

- Chưa có phím tắt F8/F9 toàn cục — dùng lệnh `next` / `save` trong Terminal thay cho phím tắt.
- Chưa tự sửa form quá 1 lần: nếu đáp án sai form, tool vẫn nhận bài, đánh dấu `form_ok=false`,
  Gemini sẽ chuẩn hoá khi gom vòng.
- Chưa nối vào phòng 3D orchestra-kit — phòng 3D sau này chỉ cần đọc `hoi_dong.db`
  để hiển thị trạng thái từng session.
- Chưa có OCR, chưa tự bấm Gửi — cố tình chưa làm, vì lý do ở đầu file này.

## Nếu lỗi

- `python` không nhận lệnh: cài Python từ python.org, lúc cài tick **Add python to PATH**,
  rồi mở lại Terminal.
- `Chua co GEMINI_API_KEY`: vẫn chạy được ở chế độ fallback; muốn đủ chức năng thì làm bước 3 ở trên.
- Lỗi 429 từ Gemini: đợi vài phút rồi chạy lại lệnh đó; đừng tạo thêm key.
- Muốn làm lại chủ đề khác sau khi xong: chạy `finalize` xong rồi `new` chủ đề mới.
  Muốn huỷ giữa chừng: xoá `hoi_dong.db` rồi `new` lại.
