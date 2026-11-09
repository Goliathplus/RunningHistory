// 西元紀年沒有 0 年：前 1 年的下一年是西元 1 年。
// 「軸位置」pos 是連續整數軸（…, 前 2 → -2, 前 1 → -1, 西元 1 → 0, 西元 2 → 1, …），
// 播放與滑桿都在 pos 上運算，顯示與查詢才換回年份。

export const TIMELINE_START_YEAR = -3500;
export const DATA_START_YEAR = -3400;
export const DATA_END_YEAR = 2024;

export const yearToPos = (year: number): number => (year > 0 ? year - 1 : year);
export const posToYear = (pos: number): number => {
  const p = Math.floor(pos);
  return p >= 0 ? p + 1 : p;
};

export const POS_MIN = yearToPos(TIMELINE_START_YEAR);
export const POS_MAX = yearToPos(DATA_END_YEAR);

export type Lang = 'zh-Hant' | 'en';

export function formatYear(year: number, lang: Lang = 'zh-Hant'): string {
  if (lang === 'en') return year < 0 ? `${-year} BCE` : `${year} CE`;
  return year < 0 ? `西元前 ${-year} 年` : `西元 ${year} 年`;
}

export function formatYearRange(from: number, to: number, lang: Lang = 'zh-Hant'): string {
  return from === to ? formatYear(from, lang) : `${formatYear(from, lang)} – ${formatYear(to, lang)}`;
}

// 時間軸非線性：近代資料密度高，分配較多寬度。
const KNOTS: ReadonlyArray<readonly [pos: number, frac: number]> = [
  [POS_MIN, 0],
  [-1000, 0.2],
  [0, 0.42],
  [1000, 0.6],
  [1800, 0.8],
  [POS_MAX, 1],
];

export function posToFrac(pos: number): number {
  const p = Math.min(POS_MAX, Math.max(POS_MIN, pos));
  for (let i = 1; i < KNOTS.length; i++) {
    const [p0, f0] = KNOTS[i - 1];
    const [p1, f1] = KNOTS[i];
    if (p <= p1) return f0 + ((p - p0) / (p1 - p0)) * (f1 - f0);
  }
  return 1;
}

export function fracToPos(frac: number): number {
  const f = Math.min(1, Math.max(0, frac));
  for (let i = 1; i < KNOTS.length; i++) {
    const [p0, f0] = KNOTS[i - 1];
    const [p1, f1] = KNOTS[i];
    if (f <= f1) return p0 + ((f - f0) / (f1 - f0)) * (p1 - p0);
  }
  return POS_MAX;
}
