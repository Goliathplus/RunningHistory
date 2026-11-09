// 依各政權的 Wikidata ID 取中文標籤，寫入 scripts/zh-names.json（已納入版控，一般重建不需重跑）。
// 繁體標籤優先；只有簡體標籤時以 OpenCC 轉為臺灣正體。
import { readFileSync, writeFileSync } from 'node:fs';
import * as OpenCC from 'opencc-js';

const toTw = OpenCC.Converter({ from: 'cn', to: 'twp' });
const data = JSON.parse(readFileSync('public/data/polities.json', 'utf8'));

const counts = new Map();
for (const [n, , , , , qid] of data.rows) {
  if (!qid) continue;
  const name = data.names[n].en;
  const inner = counts.get(name) ?? new Map();
  inner.set(qid, (inner.get(qid) ?? 0) + 1);
  counts.set(name, inner);
}
const best = new Map([...counts].map(([name, c]) => [name, [...c].sort((a, b) => b[1] - a[1])[0][0]]));
const ids = [...new Set(best.values())].filter((q) => /^Q\d+$/.test(q));
const labels = new Map();
const LANGS = ['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo', 'zh', 'zh-cn', 'zh-hans', 'zh-sg'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'world-borders-globe-build/1.0 (open data visualisation)' } });
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) throw new Error(`Wikidata ${res.status}`);
    const wait = Number(res.headers.get('retry-after')) || 15 * (attempt + 1);
    console.log(`Wikidata ${res.status}，等待 ${wait} 秒`);
    await sleep(wait * 1000);
  }
  throw new Error('Wikidata 重試次數用盡');
}

for (let i = 0; i < ids.length; i += 50) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&format=json&languages=${LANGS.join('|')}&ids=${ids.slice(i, i + 50).join('|')}`;
  const res = await politeFetch(url);
  const json = await res.json();
  for (const [qid, ent] of Object.entries(json.entities ?? {})) {
    const lang = LANGS.find((l) => ent.labels?.[l]);
    if (lang) labels.set(qid, { lang, value: ent.labels[lang].value });
  }
  await sleep(1500);
}

const out = {};
for (const [name, qid] of best) {
  const l = labels.get(qid);
  if (!l) continue;
  const traditional = ['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo'].includes(l.lang);
  out[name] = { qid, lang: l.lang, zh: traditional ? l.value : toTw(l.value) };
}
writeFileSync('scripts/zh-names.json', JSON.stringify(out, null, 0).replaceAll('},"', '},\n"'));
console.log('names', data.names.length, 'with qid', best.size, 'labelled', Object.keys(out).length);
