// Kiem tra TOAN VEN prompt truoc khi dan vao o nhap (Muc 3.4 cua thiet ke da
// chot) — chan ca that da xay ra: bot vong 2 hoi lai "phan bien ma nao" vi
// prompt thieu ma luan diem an danh. Ham thuan, test duoc bang node.
//
// Dinh dang ma thuc te trong council.js: cac bai vong 1 duoc gan nhan
// "Bai cua A" / "Bai A" ... "Bai cua D" (alias A-D cua anonymize()).
// Vong 3: prompt phai chua phan doi chieu "Da doi / Khong doi vi..." ma
// buildPrompt vong 3 chen vao form.

// Ma luan diem ky vong: A..D tru bot da Skip o vong 1 (expectedAliases do
// saga tinh tu anonymize() + danh sach skip).
export function checkPromptIntegrity(prompt, round, expectedAliases) {
  const text = String(prompt || '');
  const missing = [];
  if (round === 2) {
    const aliases = expectedAliases && expectedAliases.length ? expectedAliases : ['A', 'B', 'C', 'D'];
    for (const a of aliases) {
      if (!new RegExp(`Bài (của )?${a}\\b`).test(text)) missing.push(`mã luận điểm Bài ${a}`);
    }
    for (const marker of ['Đồng ý', 'Không đồng ý', 'Chấm điểm']) {
      if (!text.includes(marker)) missing.push(`mục "${marker}" của form phản biện`);
    }
  } else if (round === 3) {
    if (!text.includes('PHẢN BIỆN VỀ BÀI CỦA BẠN')) missing.push('phần phản biện vòng 2 về bài của bot');
    if (!/Đã đổi/.test(text)) missing.push('đối chiếu "Đã đổi"');
    if (!/Không đổi vì/.test(text)) missing.push('đối chiếu "Không đổi vì…"');
  }
  return { ok: missing.length === 0, missing };
}
