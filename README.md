# Changing Borders of the World

English | [繁體中文](README.zh-Hant.md)

An interactive 3D globe showing the territories of polities from 3400 BCE to 2024 CE. The interface is in English by default and can be switched to Traditional Chinese. Built with React, TypeScript and globe.gl (Three.js).

**Live site:** https://goliathplus.github.io/RunningHistory/

## Getting started

Requires Node.js 20 or later.

```bash
npm install
npm run dev                        # development server
npm run build && npm run preview   # production build
```

The data is already in `public/data/`, so there is nothing else to download. URL parameters: `?year=-500&paused&lang=zh-Hant`.

## Controls

| Action | How |
|---|---|
| Play / pause | Play button or Space |
| Change speed | 10–250 years per second |
| Move through time | Drag the timeline; ← → step 10 years, hold Shift for 100 |
| Rotate / zoom | Drag, scroll wheel or pinch |
| Inspect a polity | Hover for name and years, click for details |
| Change language | Menu at the top right (your choice is remembered) |

## Data and uncertainty

Borders come from [Cliopatria v0.2.1](https://github.com/Seshat-Global-History-Databank/cliopatria) (Seshat Global History Databank, CC BY 4.0; [paper](https://doi.org/10.1038/s41597-025-04516-9)).

- **3500–3401 BCE is empty.** The earliest record is from 3400 BCE, so no borders are drawn before it.
- **The data ends in 2024.**
- Only records that exist for the selected year are shown. Nothing is interpolated, and gaps are never filled with the nearest data.
- Empty land means the dataset has no polygon there. It does not mean there were no societies or political organisation.
- Borders are estimates. The dataset has no per-record confidence value, so the interface shows no confidence score.
- The grey land is the modern coastline, for orientation only, with no modern national borders.

Names in parentheses, such as `(British Empire)`, are containers for their members. A container is hidden in any year where its members have records, so areas are not coloured twice.

## Battle layer

Turn on **Battles** at the top right to see 154 hand-selected battles from the last 25 years of the current date. Selecting one jumps to its year, pauses playback, draws a dashed line to the site, highlights belligerents that have border records, and connects battles of the same war in chronological order. Dates and coordinates come from Wikidata; belligerents, results and war groupings are curated in `scripts/battles-curated.txt` and regenerated with `NODE_USE_ENV_PROXY=1 node scripts/build-battles.mjs`. The selection is editorial, not a ranking of importance.

## Names

English names are the dataset's own. Traditional Chinese names come from Wikidata. Some Wikidata IDs point to the wrong entity (a period, war or person), so the labels were reviewed and 307 were corrected in `scripts/zh-overrides.json`. The 54 polities with no reliable translation show the dataset name.

To add a language, add `src/i18n/<lang>.json`, register it in `src/i18n/index.tsx`, and supply reviewed polity names through the data pipeline.

## Tests

```bash
npm test                            # unit tests
npm run build && npm run test:e2e   # browser tests (set CHROME_PATH to choose a browser)
```

## Rebuilding the data

```bash
npm run data                                          # download the pinned version and regenerate public/data/
NODE_USE_ENV_PROXY=1 node scripts/fetch-zh-names.mjs  # refresh Wikidata names (run after npm run data)
```

## Deployment

Run `npm run build:pages`, then publish `dist/` to the `gh-pages` branch.

## License

See [`public/data/NOTICE.md`](public/data/NOTICE.md) for data licensing. Keep the source attribution on the page when deploying publicly.
