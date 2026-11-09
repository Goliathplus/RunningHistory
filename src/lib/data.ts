import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import polylabel from 'polylabel';
import { DATA_END_YEAR, DATA_START_YEAR, posToYear, yearToPos, type Lang } from './years';

declare const __DATA_BYTES__: number;

export interface PolityName {
  en: string;
  zh: string | null;
  from: number;
  to: number;
}

type RawRow = [n: number, from: number, to: number, area: number, wikipedia: string, wikidata: string, seshat: string, memberOf: string];

export interface DataFile {
  source: { name: string; version: string; commit: string };
  stats: { rows: number; polities: number; yearZeroFixes: number; skipped: number; simplifyIntervalM: number };
  names: PolityName[];
  rows: RawRow[];
  topology: Topology<{ [k: string]: GeometryCollection }>;
}

export type PolygonFeature = Feature<Polygon | MultiPolygon>;

export interface Row {
  id: number;
  n: number;
  from: number;
  to: number;
  area: number;
  wikipedia: string;
  wikidata: string;
  seshat: string;
  memberOf: string;
  isComposite: boolean;
}

export interface Dataset {
  file: DataFile;
  rows: Row[];
  names: PolityName[];
  nameIds: Map<string, number>;
  /** 依 pos（每 COVERAGE_BUCKET 年）統計的可見政權數，用於時間軸覆蓋度圖。 */
  coverage: { pos: number; count: number }[];
}

/** 英文為資料集原名（複合政權去掉括號）；中文無譯名時退回原名。 */
export function displayName(name: PolityName, lang: Lang): string {
  return (lang === 'zh-Hant' ? name.zh : null) ?? name.en.replace(/^\((.*)\)$/, '$1');
}
export const isCovered = (year: number): boolean => year >= DATA_START_YEAR && year <= DATA_END_YEAR;

// 複合政權（名稱以括號包住）是成員的聯集容器；該年已有成員紀錄就略過容器，避免重複疊色。
export function visibleRows<T extends Pick<Row, 'from' | 'to' | 'memberOf' | 'isComposite' | 'n'>>(
  rows: T[],
  names: Pick<PolityName, 'en'>[],
  year: number,
): T[] {
  const active = rows.filter((r) => r.from <= year && year <= r.to);
  const withMembers = new Set(active.map((r) => r.memberOf).filter(Boolean));
  return active.filter((r) => !(r.isComposite && withMembers.has(names[r.n].en)));
}

const COVERAGE_BUCKET = 10;

function computeCoverage(rows: Row[], names: PolityName[]) {
  const coverage: { pos: number; count: number }[] = [];
  for (let pos = yearToPos(DATA_START_YEAR); pos <= yearToPos(DATA_END_YEAR); pos += COVERAGE_BUCKET) {
    coverage.push({ pos, count: visibleRows(rows, names, posToYear(pos)).length });
  }
  return coverage;
}

export class LoadError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export async function loadDataset(onProgress?: (fraction: number) => void): Promise<Dataset> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/polities.json`);
  if (!res.ok || !res.body) throw new LoadError(res.status);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.min(1, received / __DATA_BYTES__));
  }
  const file: DataFile = JSON.parse(await new Blob(chunks as BlobPart[]).text());
  const rows: Row[] = file.rows.map(([n, from, to, area, wikipedia, wikidata, seshat, memberOf], id) => ({
    id, n, from, to, area, wikipedia, wikidata, seshat, memberOf,
    isComposite: file.names[n].en.startsWith('('),
  }));
  const nameIds = new Map(file.names.map((name, i) => [name.en, i]));
  return { file, rows, names: file.names, nameIds, coverage: computeCoverage(rows, file.names) };
}

// 幾何按需解碼並快取，13,412 筆中同一年只會用到幾百筆。
export interface RowGeometry {
  feature: PolygonFeature;
  polygons: Position[][][];
  bbox: [minLon: number, minLat: number, maxLon: number, maxLat: number];
  /** 視覺中心（最大外環的極點），用於標籤與定位。 */
  center: [lon: number, lat: number];
}

const geometryCache = new Map<number, RowGeometry>();

function ringArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) / 2;
}

export function geometryOf(ds: Dataset, row: Row): RowGeometry {
  const cached = geometryCache.get(row.id);
  if (cached) return cached;
  const objects = Object.values(ds.file.topology.objects)[0];
  const f = feature(ds.file.topology, objects.geometries[row.id]) as PolygonFeature;
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
  let largest = polygons[0];
  let largestArea = -1;
  for (const poly of polygons) {
    const area = ringArea(poly[0]);
    if (area > largestArea) {
      largestArea = area;
      largest = poly;
    }
    for (const [lon, lat] of poly[0]) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const c = polylabel(largest, 0.5);
  const geometry: RowGeometry = { feature: f, polygons, bbox: [minLon, minLat, maxLon, maxLat], center: [c[0], c[1]] };
  geometryCache.set(row.id, geometry);
  return geometry;
}

function ringContains(ring: Position[], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonsContain(polygons: Position[][][], lon: number, lat: number): boolean {
  return polygons.some((poly) => {
    if (!ringContains(poly[0], lon, lat)) return false;
    return !poly.slice(1).some((hole) => ringContains(hole, lon, lat));
  });
}

/** 取該點上面積最小的政權（與繪製順序一致，小的在上層）。 */
export function pickRow(ds: Dataset, active: Row[], lon: number, lat: number): Row | null {
  let best: Row | null = null;
  for (const row of active) {
    if (best && row.area >= best.area) continue;
    const g = geometryOf(ds, row);
    if (lon < g.bbox[0] || lon > g.bbox[2] || lat < g.bbox[1] || lat > g.bbox[3]) continue;
    if (polygonsContain(g.polygons, lon, lat)) best = row;
  }
  return best;
}

export function colorKey(ds: Dataset, row: Row): string {
  return row.memberOf || ds.names[row.n].en;
}

/** 由名稱雜湊出穩定色相，同一政權跨年代顏色不變。 */
export function hueFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}
