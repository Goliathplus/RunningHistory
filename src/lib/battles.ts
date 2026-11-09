import { displayName, type Dataset, type Row } from './data';
import { yearToPos, type Lang } from './years';

export type Side = string | [en: string, zh: string];

export interface Battle {
  q: string;
  y: number;
  en: string;
  zh: string;
  lng: number;
  lat: number;
  date: string | null;
  started: boolean;
  war: string | null;
  a: Side[];
  b: Side[];
  win: 'a' | 'b' | 'd';
  dateUncertain: boolean;
  locUncertain: boolean;
  wp: string | null;
}

export interface BattleData {
  wars: Record<string, [en: string, zh: string]>;
  battles: Battle[];
}

export interface WindowItem {
  battle: Battle;
  age: number;
}

/** 戰役只發生在一個時間點，播放時保留最近這些年，並標示為「近 N 年」。 */
export const BATTLE_WINDOW = 25;

export function battlesInWindow(battles: Battle[], pos: number): WindowItem[] {
  const items: WindowItem[] = [];
  for (const battle of battles) {
    const age = pos - yearToPos(battle.y);
    if (age >= 0 && age <= BATTLE_WINDOW) items.push({ battle, age });
  }
  return items.sort((x, y) => x.age - y.age);
}

export const battleName = (b: Battle, lang: Lang): string => (lang === 'en' ? b.en : b.zh);

export function sideLabel(side: Side, ds: Dataset, lang: Lang): string {
  if (typeof side !== 'string') return lang === 'en' ? side[0] : side[1];
  const id = ds.nameIds.get(side);
  return id === undefined ? side : displayName(ds.names[id], lang);
}

/** 該交戰方在當年實際繪製的疆域；複合政權對應到其成員。資料集沒有時回傳空陣列。 */
export function rowsForSide(side: Side, ds: Dataset, active: Row[]): Row[] {
  if (typeof side !== 'string') return [];
  return active.filter((r) => ds.names[r.n].en === side || r.memberOf === side);
}

export function warSequence(data: BattleData, battle: Battle): Battle[] {
  if (!battle.war) return [];
  return data.battles.filter((b) => b.war === battle.war).sort((x, y) => x.y - y.y);
}
