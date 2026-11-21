// Diem tin cay cua PHEP TRICH XUAT dap an (Extractor v3, Muc 2.2 cua thiet ke
// da chot) — KHONG phai xac suat dap an dung. Ham thuan, khong phu thuoc
// DOM/Redux de test bang node duoc. Ban sao logic nay cung nam trong
// electron/answerExtract.js (CommonJS) de main process cham diem ngay khi
// doc tab; hai ban PHAI khop nhau — test o ui/test kiem tra bang diem nay.
//
// Bang diem (tong 100):
//  strategy   0-25: custom da xac nhan / pick = 25, default = 18, scan = 10, deep = 5
//  length     0-20: >=200 ky tu = 20; 80-199 = 12; 20-79 = 5; <20 = 0
//  stability  0-25: 2 lan doc cach ~1,2s giong >=98% = 25; 90-97% = 12; <90% = 0
//  duplicate  0-15: khac dap an truoc cua chinh bot = 15; trung >=95% = 0
//  headings   0-10: du muc bat buoc cua mau vong = 10, thieu 1 muc tru 3
//  stop       0-5 : khong con dau hieu dang go = 5; con nut Stop = 0

export const STRATEGY_POINTS = { custom: 25, pick: 25, default: 18, scan: 10, deep: 5 };

// Do giong 0..1 giua 2 doan text (Dice tren bigram ky tu — du on dinh cho
// viec phat hien "bot van dang go" va "trung dap an cu").
export function textSimilarity(a, b) {
  const s1 = String(a || '').replace(/\s+/g, ' ').trim();
  const s2 = String(b || '').replace(/\s+/g, ' ').trim();
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const bigrams = (s) => {
    const map = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) || 0) + 1);
    }
    return map;
  };
  const m1 = bigrams(s1);
  const m2 = bigrams(s2);
  let hit = 0;
  for (const [g, n] of m1) hit += Math.min(n, m2.get(g) || 0);
  const total = (s1.length - 1) + (s2.length - 1);
  return total > 0 ? (2 * hit) / total : 0;
}

export function scoreConfidence({ strategy, text, secondText, prevText, requiredHeadings, stopVisible } = {}) {
  const value = String(text || '');
  const breakdown = {};

  breakdown.strategy = STRATEGY_POINTS[strategy] ?? 5;

  const len = value.length;
  breakdown.length = len >= 200 ? 20 : len >= 80 ? 12 : len >= 20 ? 5 : 0;

  if (secondText == null) {
    breakdown.stability = 0; // chua doc lan 2 — khong tu cho diem
  } else {
    const sim = textSimilarity(value, secondText);
    breakdown.stability = sim >= 0.98 ? 25 : sim >= 0.9 ? 12 : 0;
  }

  if (prevText && String(prevText).trim()) {
    breakdown.duplicate = textSimilarity(value, prevText) >= 0.95 ? 0 : 15;
  } else {
    breakdown.duplicate = 15; // khong co dap an truoc de trung
  }

  const headings = Array.isArray(requiredHeadings) ? requiredHeadings.filter(Boolean) : [];
  if (!headings.length) {
    breakdown.headings = 10;
  } else {
    const missing = headings.filter((h) => !value.includes(h)).length;
    breakdown.headings = Math.max(0, 10 - missing * 3);
  }

  breakdown.stopVisible = stopVisible ? 0 : 5;

  const confidence = Object.values(breakdown).reduce((s, n) => s + n, 0);
  return { confidence, breakdown };
}

// Ly do mat diem bang tieng Viet de hien o o duyet (chi liet ke tieu chi
// chua dat diem toi da).
export function confidenceReasons(breakdown) {
  if (!breakdown) return [];
  const out = [];
  if (breakdown.strategy < 25) out.push('Chưa lấy được bằng selector đáng tin nhất (đang dùng tầng dự phòng).');
  if (breakdown.length < 20) out.push('Đáp án ngắn bất thường — có thể bot chưa trả lời xong hoặc lấy thiếu nội dung.');
  if (breakdown.stability < 25) out.push('Nội dung thay đổi giữa 2 lần đọc — bot có thể vẫn đang gõ.');
  if (breakdown.duplicate < 15) out.push('Nội dung gần như trùng đáp án trước của chính bot này — có thể đã lấy nhầm khối cũ.');
  if (breakdown.headings < 10) out.push('Thiếu một số mục theo mẫu trình bày của vòng này.');
  if (breakdown.stopVisible < 5) out.push('Trang vẫn còn dấu hiệu đang gõ (nút Stop còn hiện).');
  return out;
}

export function confidenceBand(confidence) {
  if (confidence == null) return null;
  if (confidence >= 90) return 'high';
  if (confidence >= 60) return 'medium';
  return 'low';
}
