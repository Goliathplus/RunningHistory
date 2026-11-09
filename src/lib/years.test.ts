import { describe, expect, it } from 'vitest';
import { formatYear, formatYearRange, fracToPos, POS_MAX, POS_MIN, posToFrac, posToYear, yearToPos } from './years';

describe('BCE/CE 年份', () => {
  it('沒有 0 年：前 1 年緊接西元 1 年', () => {
    expect(yearToPos(-1)).toBe(-1);
    expect(yearToPos(1)).toBe(0);
    expect(posToYear(-1)).toBe(-1);
    expect(posToYear(0)).toBe(1);
  });
  it('所有年份往返一致且不出現 0', () => {
    for (let y = -3500; y <= 2024; y++) {
      if (y === 0) continue;
      expect(posToYear(yearToPos(y))).toBe(y);
    }
    for (let p = POS_MIN; p <= POS_MAX; p++) expect(posToYear(p)).not.toBe(0);
  });
  it('跨紀元的年數正確', () => {
    expect(yearToPos(14) - yearToPos(-27)).toBe(40);
  });
  it('格式化', () => {
    expect(formatYear(-753)).toBe('西元前 753 年');
    expect(formatYear(1912)).toBe('西元 1912 年');
    expect(formatYearRange(5, 5)).toBe('西元 5 年');
    expect(formatYear(-753, 'en')).toBe('753 BCE');
    expect(formatYearRange(-27, 14, 'en')).toBe('27 BCE – 14 CE');
  });
});

describe('時間軸比例尺', () => {
  it('端點與單調性', () => {
    expect(posToFrac(POS_MIN)).toBe(0);
    expect(posToFrac(POS_MAX)).toBe(1);
    for (let p = POS_MIN + 1; p <= POS_MAX; p += 7) expect(posToFrac(p)).toBeGreaterThan(posToFrac(p - 1));
  });
  it('正反轉換一致', () => {
    for (const p of [-3500, -2222, -1000, -1, 0, 333, 1000, 1500, 1800, 1999, POS_MAX]) {
      expect(fracToPos(posToFrac(p))).toBeCloseTo(p, 6);
    }
  });
});
