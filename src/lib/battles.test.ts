import { describe, expect, it } from 'vitest';
import { battleName, battlesInWindow, rowsForSide, warSequence, type Battle, type BattleData } from './battles';
import type { Dataset, Row } from './data';
import { yearToPos } from './years';

const b = (q: string, y: number, war: string | null = null) => ({ q, y, en: q, zh: `戰${q}`, war }) as Battle;

describe('戰役時間窗', () => {
  const all = [b('a', -2), b('b', 5), b('c', 20), b('d', 30)];
  it('只含窗內且未來的不顯示，最新在前', () => {
    expect(battlesInWindow(all, yearToPos(20)).map((i) => i.battle.q)).toEqual(['c', 'b', 'a']);
  });
  it('跨紀元的年齡不含 0 年', () => {
    const item = battlesInWindow([b('a', -10)], yearToPos(5)).at(0);
    expect(item?.age).toBe(14);
  });
  it('超過窗長即消失', () => {
    expect(battlesInWindow([b('a', 100)], yearToPos(126))).toEqual([]);
    expect(battlesInWindow([b('a', 100)], yearToPos(125))).toHaveLength(1);
  });
});

describe('戰役資料', () => {
  it('依語言顯示名稱', () => {
    expect(battleName(b('x', 1), 'en')).toBe('x');
    expect(battleName(b('x', 1), 'zh-Hant')).toBe('戰x');
  });
  it('同戰爭依年份排序，無戰爭回傳空', () => {
    const data = { wars: {}, battles: [b('z', 1918, 'w'), b('y', 1914, 'w'), b('o', 1915)] } as BattleData;
    expect(warSequence(data, data.battles[0]).map((x) => x.q)).toEqual(['y', 'z']);
    expect(warSequence(data, data.battles[2])).toEqual([]);
  });
  it('交戰方對應疆域：含複合成員，文字交戰方不高亮', () => {
    const ds = { names: [{ en: 'A' }, { en: 'B' }] } as unknown as Dataset;
    const rows = [{ n: 0, memberOf: '' }, { n: 1, memberOf: '(E)' }] as Row[];
    expect(rowsForSide('A', ds, rows)).toEqual([rows[0]]);
    expect(rowsForSide('(E)', ds, rows)).toEqual([rows[1]]);
    expect(rowsForSide(['x', 'y'], ds, rows)).toEqual([]);
  });
});
