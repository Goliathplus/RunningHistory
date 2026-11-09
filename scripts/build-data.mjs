// 重建 public/data/ 內的資料檔：下載固定版本的 Cliopatria → 過濾 → 簡化 → 字典編碼。
// 用法：npm run data（需網路；原始檔快取於 .cache/）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

const COMMIT = '5f433377139a6eeaeacbdc894b70f8805b72c8b5'; // Cliopatria v0.2.1
const ZIP_URL = `https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/${COMMIT}/cliopatria.geojson.zip`;
const CACHE = '.cache';
const RAW = `${CACHE}/cliopatria.geojson`;
const SIMPLIFIED = `${CACHE}/simplified.topo.json`;
const SIMPLIFY_INTERVAL_M = 3000;

mkdirSync(CACHE, { recursive: true });
mkdirSync('public/data', { recursive: true });

if (!existsSync(RAW)) {
  console.log('下載', ZIP_URL);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`下載失敗：${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const entry = Object.keys(files).find((n) => n.endsWith('.geojson'));
  writeFileSync(RAW, files[entry]);
}

if (!existsSync(SIMPLIFIED)) {
  console.log('簡化幾何（共用邊界保持拓撲）…');
  execFileSync(
    process.execPath,
    [
      '--max-old-space-size=10000',
      'node_modules/mapshaper/bin/mapshaper',
      RAW,
      '-filter', 'Type === "POLITY"',
      '-simplify', 'weighted', `interval=${SIMPLIFY_INTERVAL_M}`, 'keep-shapes',
      '-o', 'format=topojson', 'quantization=200000', SIMPLIFIED,
    ],
    { stdio: 'inherit' },
  );
}

const zhNames = existsSync('scripts/zh-names.json')
  ? JSON.parse(readFileSync('scripts/zh-names.json', 'utf8'))
  : {};
const overrides = JSON.parse(readFileSync('scripts/zh-overrides.json', 'utf8'));

const topo = JSON.parse(readFileSync(SIMPLIFIED, 'utf8'));
const layer = Object.values(topo.objects)[0];

// 資料中偶見「0 年」，但西元紀年沒有 0 年：起年 0 → 西元 1 年，迄年 0 → 西元前 1 年。
function fixYearZero(from, to) {
  if (from === 0 && to === 0) return [-1, 1];
  return [from === 0 ? 1 : from, to === 0 ? -1 : to];
}

const nameIndex = new Map();
const names = [];
const rows = [];
let yearZeroFixes = 0;
let skipped = 0;
const geometries = [];

for (const geom of layer.geometries) {
  const p = geom.properties;
  if (!geom.type || p.FromYear > p.ToYear) {
    skipped++;
    continue;
  }
  const [from, to] = fixYearZero(p.FromYear, p.ToYear);
  if (from !== p.FromYear || to !== p.ToYear) yearZeroFixes++;
  let n = nameIndex.get(p.Name);
  if (n === undefined) {
    n = names.length;
    nameIndex.set(p.Name, n);
    names.push({
      en: p.Name,
      zh: overrides[p.Name] ?? zhNames[p.Name]?.zh ?? null,
      from,
      to,
    });
  }
  names[n].from = Math.min(names[n].from, from);
  names[n].to = Math.max(names[n].to, to);
  rows.push([n, from, to, Math.round(p.Area), p.Wikipedia || '', p.Wikidata || '', p.SeshatID || '', p.MemberOf || '']);
  delete geom.properties;
  geometries.push(geom);
}

layer.geometries = geometries;
const generated = {
  source: { name: 'Cliopatria', version: 'v0.2.1', commit: COMMIT },
  stats: { rows: rows.length, polities: names.length, yearZeroFixes, skipped, simplifyIntervalM: SIMPLIFY_INTERVAL_M },
  names,
  rows,
  topology: topo,
};
writeFileSync('public/data/polities.json', JSON.stringify(generated));
copyFileSync('node_modules/world-atlas/land-50m.json', 'public/data/land-50m.json');
console.log(generated.stats, 'translated', names.filter((n) => n.zh).length);
