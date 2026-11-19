# Công cụ Chat Hội Đồng — Thiết kế vòng, session, form và điều phối bằng Gemini API

Ngày: 2026-11-19
Thành viên hội đồng (web miễn phí, thao tác bán tự động): ChatGPT, Claude, Gemini web, Copilot
Điều phối viên (API Google miễn phí): Gemini API — chỉ làm 3 việc: lập kế hoạch vòng, tóm tắt/chuẩn hoá, tạo prompt vòng sau và tổng hợp cuối.
Bộ nhớ thật: code local + SQLite. KHÔNG nằm trong các hộp chat.

## 1. Nguyên tắc cốt lõi

1. Các hộp chat là "công nhân không trí nhớ": mỗi vòng = 1 session MỚI.
   - Lý do: session cũ khiến chatbot bám vào câu trả lời cũ của chính nó, giữ vai trò cũ, và ngữ cảnh bị loãng.
   - Session mới + gói ngữ cảnh do điều phối viên cấp = chatbot nắm đúng vai trò, đúng ngữ cảnh của vòng đó.
2. Chỉ điều phối viên + code mới có trí nhớ xuyên suốt (lưu trong SQLite).
3. Form thống nhất do 3 lớp ép: prompt có mẫu -> code kiểm tra tiêu đề -> Gemini API sửa/chuẩn hoá khi gom.
4. Tiết kiệm quota API miễn phí: gom cả 4 câu trả lời vào 1 lần gọi API/vòng để chuẩn hoá, không gọi 4 lần riêng.

## 2. Các vòng thảo luận (mặc định 3 vòng + tổng hợp)

| Vòng | Session | Vai trò | Đầu vào | Đầu ra |
|---|---|---|---|---|
| 0 - Lập kế hoạch | Chỉ API | Điều phối viên | Chủ đề của người dùng | Mục tiêu, tiêu chí chấm, phân vai Vòng 1, prompt cho từng bot |
| 1 - Đề xuất độc lập (mù) | Mới cho mỗi bot, không thấy nhau | Mỗi bot 1 vai khác nhau | Chủ đề + vai trò + form | Đề xuất theo form |
| 2 - Phản biện chéo (ẩn danh) | Mới cho mỗi bot | Người phản biện (không phản biện bài của mình) | Thẻ luận điểm của A/B/C/D (ẩn tên bot, xáo thứ tự theo người nhận) | Phản biện theo form vòng 2 |
| 3 - Sửa bài | Mới cho mỗi bot | Tác giả sửa bài | Bài gốc của chính bot đó + các phản biện nhận được | Bản sửa + ghi rõ đã sửa gì |
| Cuối - Tổng hợp | Chỉ API | Điều phối viên | Toàn bộ thẻ luận điểm + bản sửa | Kết luận chung, điểm đồng thuận, điểm còn tranh cãi, ý kiến thiểu số |

Số thao tác tay: 4 bot x 3 vòng = 12 lần dán + 12 lần copy cho 1 chủ đề. Không nên thêm vòng nếu không cần.

### Phân vai mẫu Vòng 1 (xoay vòng ở các chủ đề sau để tránh thiên lệch)
- ChatGPT: Người đề xuất phương án tổng thể (cấu trúc, bước làm)
- Claude: Người phân tích rủi ro và phản ví dụ
- Gemini web: Người bổ sung góc nhìn / tìm kiếm / đa phương tiện nếu có
- Copilot: Người kiểm chứng thực tế, nguồn web, tính khả thi

Vòng 2: vai trò đổi thành phản biện chéo theo vòng tròn: ChatGPT phản biện Claude, Claude phản biện Gemini, Gemini phản biện Copilot, Copilot phản biện ChatGPT.
Vòng 3: mỗi bot trở lại làm tác giả của bài mình.

## 3. Form thống nhất (áp cho mọi bot, mọi vòng 1 và 3)

```markdown
## Kết luận ngắn
(tối đa 3 câu)

## Luận điểm chính
1. ... — căn cứ: ...
2. ... — căn cứ: ...
(tối đa 5 luận điểm)

## Rủi ro / điểm chưa chắc
- ...

## Độ tin cậy
Cao / Trung bình / Thấp — vì: ...

## Cần kiểm chứng thêm
- ... (nếu không có, ghi "Không có")
```

Form riêng Vòng 2 (phản biện):
```markdown
## Đồng ý
- [mã luận điểm] ...
## Không đồng ý
- [mã luận điểm] ... — lý do + phản ví dụ: ...
## Điểm bài viết bỏ sót
- ...
## Chấm điểm
- Đúng đắn: x/10 — Khả thi: x/10 — Đầy đủ: x/10
```

Quy tắc ép form:
- Prompt luôn kèm form + 1 ví dụ ngắn đã điền.
- Code kiểm tra bằng regex: đủ 5 tiêu đề? vượt độ dài? thiếu mục độ tin cậy? -> sai thì tạo prompt sửa: "Chỉ định dạng lại bài dưới đây theo form, KHÔNG thêm nội dung mới: ..."
- Tối đa sửa 1 lần. Vẫn sai -> vẫn nhận bài, Gemini API chuẩn hoá khi gom, đánh dấu form_ok=false.

## 4. Gói ngữ cảnh (Context Packet) — thứ duy nhất chatbot nhận mỗi vòng

Cấu trúc 4 tầng, theo thứ tự này:
1. TẦNG CỐ ĐỊNH: chủ đề gốc, mục tiêu, ràng buộc, tiêu chí chấm (không đổi suốt chủ đề)
2. TẦNG VÒNG: tóm tắt các vòng trước DƯỚI DẠNG THẺ LUẬN ĐIỂM (không dán nguyên văn dài)
3. TẦNG VAI TRÒ: vai của bạn vòng này, việc phải làm, việc không được làm
4. TẦNG FORM: mẫu form + giới hạn độ dài

Thẻ luận điểm (do Gemini API tạo khi gom mỗi vòng):
```json
{
  "bot_alias": "A",
  "claims": [{"id": "A1", "text": "...", "basis": "..."}],
  "risks": ["..."],
  "confidence": "Trung bình",
  "form_ok": true
}
```
Vòng sau chỉ nhận thẻ luận điểm của người khác, không nhận nguyên văn -> prompt ngắn, không vượt giới hạn ký tự khi dán, và các bot "hiểu nhau" qua cùng một ngôn ngữ thẻ.

Ẩn danh ở Vòng 2: đổi tên bot thành A/B/C/D và xáo thứ tự theo từng người nhận để tránh thiên lệch vị trí và thiên lệch thương hiệu.

## 5. Ba lần gọi Gemini API (dùng structured output JSON schema)

Gemini API hỗ trợ ép đầu ra theo JSON schema khai báo sẵn, nên 3 đầu ra dưới đây luôn parse được bằng code.

1. plan(topic) -> {goal, criteria[], roles{bot: role}, prompts{bot: prompt_text}}
2. normalize_round(round, answers[4]) -> {cards[4] như mục 4, common_ground[], disagreements[], open_questions[], prompts_next{bot: prompt_text}}
   - Gọi 1 lần cho cả 4 bài, không gọi 4 lần.
3. finalize(all_cards, revised_answers) -> {final_answer, consensus[], disputes[], minority_opinion}

Ngân sách quota: 1 (kế hoạch) + 1/vòng x 3 vòng + 1 (tổng hợp) = khoảng 5 lần gọi API / 1 chủ đề.
Giới hạn free tier tính theo project (RPM/TPM/RPD) và Google không công bố con số cố định trên docs — con số thật của project của bạn xem trong Google AI Studio > Rate limits. Vì vậy: ưu tiên model Flash-Lite cho khâu chuẩn hoá (hạn mức ngày thường cao hơn hẳn dòng Flash), để dành model Flash cho khâu tổng hợp cuối. Khi gặp lỗi 429: code chờ và thử lại ở vòng sau, không tạo thêm key/project để lách hạn mức.

## 6. Đổi session mỗi vòng — thao tác cụ thể

Với mỗi bot, mỗi vòng:
1. Bấm "New chat" mở session mới (không chat tiếp trong session vòng trước)
2. Công cụ đưa prompt của bot đó vào clipboard + hiện nhãn: [Chủ đề T03 - Vòng 2 - Claude - Phản biện]
3. Người dùng dán (Ctrl+V) và bấm Gửi (hành động của người)
4. Trả lời xong: người dùng copy, nhấn phím tắt F9 để công cụ lưu vào đúng ô (chủ đề/vòng/bot)
5. (Tuỳ chọn) Đổi tên session trong giao diện bot theo nhãn ở bước 2, hoặc lưu link Share của session vào bảng sessions

Bảng SQLite tối thiểu:
- topics(id, title, goal, criteria_json, status)
- rounds(id, topic_id, round_no, kind, status)
- sessions(id, topic_id, round_id, bot, alias, role, session_url, status)
- answers(id, session_id, raw_text, normalized_json, form_ok)
- packets(id, round_id, bot, prompt_text)

## 7. MVP làm trước
- 1 chủ đề, 4 bot, 3 vòng, phím tắt: F8 = lấy prompt tiếp theo vào clipboard, F9 = lưu đáp án trong clipboard
- Code kiểm tra form + gọi Gemini API 3 hàm ở mục 5
- Chưa làm: tự động bấm Gửi, OCR, phòng 3D. Phòng 3D của orchestra-kit chỉ hiển thị trạng thái các session từ SQLite này.
