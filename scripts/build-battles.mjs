// 重建 public/data/battles.json：人工審定名單 + Wikidata 的日期、座標與條目連結。
// 用法：NODE_USE_ENV_PROXY=1 node scripts/build-battles.mjs（Wikidata 回應快取於 .cache/）
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = '.cache/battles-wikidata.json';
const entries = readFileSync('scripts/battles-curated.txt', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
  const [q, year, zh, war, a, b, win, flags] = l.split('|');
  return { q, year: Number(year), zh, war, a: a.split('+'), b: b.split('+'), win, flags: flags ? flags.split(',') : [] };
});
const wars = JSON.parse(readFileSync('scripts/battles-wars.json', 'utf8'));

if (!existsSync(CACHE)) {
  const query = `SELECT ?b ?bLabel ?date ?prec ?start ?sprec ?coord ?article WHERE {
    VALUES ?b { ${entries.map((e) => `wd:${e.q}`).join(' ')} }
    ?b wdt:P625 ?coord.
    OPTIONAL { ?b p:P585/psv:P585 ?v. ?v wikibase:timeValue ?date; wikibase:timePrecision ?prec. }
    OPTIONAL { ?b p:P580/psv:P580 ?s. ?s wikibase:timeValue ?start; wikibase:timePrecision ?sprec. }
    OPTIONAL { ?article schema:about ?b; schema:isPartOf <https://en.wikipedia.org/>. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'world-borders-globe-build/1.0 (open data visualisation)' },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  writeFileSync(CACHE, await res.text());
}

// SPARQL 的西元前年份是天文紀年：-0631 = 西元前 632 年。
const astroToHistorical = (y) => (y <= 0 ? y - 1 : y);
function parseTime(value) {
  const m = value.match(/^(-?\d+)-(\d{2})-(\d{2})/);
  return { year: astroToHistorical(Number(m[1])), iso: `${m[1].replace(/^-/, '')}-${m[2]}-${m[3]}` };
}

const results = new Map();
for (const x of JSON.parse(readFileSync(CACHE, 'utf8')).results.bindings) {
  const q = x.b.value.split('/').pop();
  (results.get(q) ?? results.set(q, []).get(q)).push(x);
}

const polities = JSON.parse(readFileSync('public/data/polities.json', 'utf8'));
const hasRecord = (name, year) => polities.rows.some(([n, from, to, , , , , member]) =>
  from <= year && year <= to && (polities.names[n].en === name || member === name));

const problems = [];
const battles = entries.flatMap((e) => {
  if (e.war && !wars[e.war]) problems.push(`${e.q}: 未知戰爭鍵 ${e.war}`);
  for (const side of [...e.a, ...e.b]) {
    if (side.startsWith('~')) continue;
    if (!hasRecord(side, e.year)) {
      const hints = polities.rows.filter(([, from, to]) => from <= e.year && e.year <= to).map(([n]) => polities.names[n].en)
        .filter((n) => side.split(' ').some((w) => w.length > 3 && !['Empire', 'Kingdom', 'Dynasty', 'Republic'].includes(w) && n.includes(w)));
      problems.push(`${e.q} ${e.year}: 「${side}」無紀錄；同年相近：${[...new Set(hints)].slice(0, 6).join(', ') || '無'}`);
    }
  }
  const rows = results.get(e.q);
  if (!rows) { problems.push(`${e.q}: Wikidata 無結果`); return []; }
  const candidates = rows.flatMap((r) => [
    r.date && { ...parseTime(r.date.value), prec: Number(r.prec.value), started: false, r },
    r.start && { ...parseTime(r.start.value), prec: Number(r.sprec.value), started: true, r },
  ].filter(Boolean));
  const t = candidates.find((c) => c.year === e.year);
  if (!t) { problems.push(`${e.q}: 年份 ${e.year} 不符 Wikidata（${[...new Set(candidates.map((c) => c.year))]}）`); return []; }
  const [lng, lat] = t.r.coord.value.slice(6, -1).split(' ').map(Number);
  const side = (s) => (s.startsWith('~') ? s.slice(1).split('@') : s);
  return [{
    q: e.q, y: e.year, en: t.r.bLabel.value, zh: e.zh, lng, lat,
    // 公曆改制前的日期曆法不一，只顯示年份。
    date: t.prec >= 11 && e.year >= 1582 ? t.iso : null,
    started: t.started,
    war: e.war || null,
    a: e.a.map(side), b: e.b.map(side), win: e.win,
    dateUncertain: e.flags.includes('date'), locUncertain: e.flags.includes('loc'),
    wp: t.r.article ? decodeURIComponent(t.r.article.value.split('/wiki/')[1]) : null,
  }];
});

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
battles.sort((x, y) => x.y - y.y);
writeFileSync('public/data/battles.json', JSON.stringify({ wars, battles }));
console.log('battles', battles.length);
