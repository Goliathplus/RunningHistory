import { describe, expect, it } from 'vitest';
import { displayName, hueFor, polygonsContain, visibleRows } from './data';

const names = [{ en: '(Empire)' }, { en: 'Member' }, { en: 'Other' }];
const row = (n: number, from: number, to: number, memberOf = '') => ({ n, from, to, memberOf, isComposite: names[n].en.startsWith('(') });

describe('時間切片', () => {
  const rows = [row(0, -100, 100), row(1, 1, 50, '(Empire)'), row(2, -50, -10)];
  it('起訖年皆包含', () => {
    expect(visibleRows(rows, names, -50).map((r) => r.n)).toEqual([0, 2]);
    expect(visibleRows(rows, names, -10).map((r) => r.n)).toEqual([0, 2]);
    expect(visibleRows(rows, names, -9).map((r) => r.n)).toEqual([0]);
  });
  it('已有成員時隱藏複合容器', () => {
    expect(visibleRows(rows, names, 10).map((r) => r.n)).toEqual([1]);
  });
  it('沒有成員時保留複合容器', () => {
    expect(visibleRows(rows, names, 60).map((r) => r.n)).toEqual([0]);
  });
  it('資料空白年回傳空集合而非最近資料', () => {
    expect(visibleRows(rows, names, 500)).toEqual([]);
  });
});

describe('點選判定', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  it('內外判定含孔洞', () => {
    expect(polygonsContain([[square, hole]], 2, 2)).toBe(true);
    expect(polygonsContain([[square, hole]], 5, 5)).toBe(false);
    expect(polygonsContain([[square]], 12, 2)).toBe(false);
  });
});

describe('顏色', () => {
  it('穩定且在色相範圍內', () => {
    expect(hueFor('Roman Empire')).toBe(hueFor('Roman Empire'));
    expect(hueFor('Han Dynasty')).toBeLessThan(360);
  });
});

describe('多語系名稱', () => {
  const rome = { en: 'Roman Empire', zh: '羅馬帝國', from: -27, to: 395 };
  it('依語言顯示', () => {
    expect(displayName(rome, 'zh-Hant')).toBe('羅馬帝國');
    expect(displayName(rome, 'en')).toBe('Roman Empire');
  });
  it('無譯名退回原名，複合政權去括號', () => {
    expect(displayName({ ...rome, en: '(British Empire)', zh: null }, 'zh-Hant')).toBe('British Empire');
  });
});
