import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Topology } from 'topojson-specification';
import { GlobeView, type HoverInfo } from './components/GlobeView';
import { PolityCard } from './components/PolityCard';
import { SourcesDialog } from './components/SourcesDialog';
import { Timeline } from './components/Timeline';
import { LANGUAGES, useI18n } from './i18n';
import { displayName, isCovered, LoadError, loadDataset, visibleRows, type Dataset, type Row } from './lib/data';
import { DATA_START_YEAR, formatYear, formatYearRange, POS_MAX, POS_MIN, posToYear, yearToPos, type Lang } from './lib/years';

const SPEEDS = [10, 25, 50, 100, 250];
const SPARSE_THRESHOLD = 10;

function initialState() {
  const params = new URLSearchParams(location.search);
  const year = Number(params.get('year'));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    pos: year && year >= -3500 && year <= 2024 ? yearToPos(year) : yearToPos(DATA_START_YEAR),
    playing: !params.has('paused') && !reduced,
  };
}

export function App() {
  const { t } = useI18n();
  const [ds, setDs] = useState<Dataset | null>(null);
  const [land, setLand] = useState<Topology | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [globeReady, setGlobeReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadDataset(setProgress),
      fetch(`${import.meta.env.BASE_URL}data/land-50m.json`).then((r) => r.json() as Promise<Topology>),
    ])
      .then(([d, l]) => {
        if (cancelled) return;
        setDs(d);
        setLand(l);
      })
      .catch((e: unknown) => setError(e instanceof LoadError ? t('loadHttp', { status: e.status }) : String(e)));
    // 只載入一次；錯誤文字以當下語言為準。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { cancelled = true; };
  }, []);

  const handleReady = useCallback(() => setGlobeReady(true), []);

  return (
    <div className="app">
      {ds && land && <Explorer ds={ds} land={land} onReady={handleReady} />}
      {!globeReady && (
        <div className="loading" role="status">
          <h1>{t('title')}</h1>
          {error ? <p className="load-error">{t('loadFailed', { msg: error })}</p> : (
            <>
              <div className="load-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <p>{t(progress < 1 ? 'loadingData' : 'loadingGlobe')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Explorer({ ds, land, onReady }: { ds: Dataset; land: Topology; onReady: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [init] = useState(initialState);
  const [pos, setPos] = useState(init.pos);
  const [playing, setPlaying] = useState(init.playing);
  const [speed, setSpeed] = useState(50);
  const [autoRotate, setAutoRotate] = useState(false);
  const [selectedName, setSelectedName] = useState<number | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ row: Row; nonce: number } | null>(null);
  const [resetRequest, setResetRequest] = useState(0);

  const year = posToYear(pos);
  const covered = isCovered(year);
  const active = useMemo(() => visibleRows(ds.rows, ds.names, year), [ds, year]);

  // 同一組紀錄沿用同一陣列，避免無變化的年份觸發重畫。
  const stableActive = useRef(active);
  const sameRows = stableActive.current.length === active.length && stableActive.current.every((r, i) => r === active[i]);
  if (!sameRows) stableActive.current = active;
  const activeRows = stableActive.current;

  const selectedRow = useMemo(
    () => (selectedName === null ? null : activeRows.find((r) => r.n === selectedName) ?? null),
    [activeRows, selectedName],
  );

  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let exact = posRef.current >= POS_MAX ? POS_MIN : posRef.current;
    const tick = (now: number) => {
      exact = Math.min(POS_MAX, exact + ((now - last) / 1000) * speed);
      last = now;
      setPos(Math.floor(exact));
      if (exact >= POS_MAX) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const stepBy = useCallback((delta: number) => {
    setPlaying(false);
    setPos((p) => Math.min(POS_MAX, Math.max(POS_MIN, p + delta)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showSources) return;
      if (e.code === 'Space') {
        if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'A') return;
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        stepBy((e.code === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 100 : 10));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSources, stepBy]);

  const handleSelect = useCallback((row: Row | null) => setSelectedName(row ? row.n : null), []);
  const handleScrubStart = useCallback(() => setPlaying(false), []);
  const handleScrub = useCallback((p: number) => {
    setPlaying(false);
    setPos(p);
  }, []);

  const notice = !covered
    ? { kind: 'gap', text: t('noticeGap', { year: formatYear(DATA_START_YEAR, lang) }) }
    : activeRows.length < SPARSE_THRESHOLD
      ? { kind: 'sparse', text: t('noticeSparse', { n: activeRows.length }) }
      : null;

  return (
    <>
      <div className="sky" />
      <GlobeView
        ds={ds}
        land={land}
        lang={lang}
        active={activeRows}
        selected={selectedRow}
        autoRotate={autoRotate}
        focusRequest={focusRequest}
        resetRequest={resetRequest}
        onSelect={handleSelect}
        onHover={setHover}
        onReady={onReady}
      />

      <header className="masthead">
        <h1>{t('title')}</h1>
        <div className="year" data-testid="year" aria-live="off">{formatYear(year, lang)}</div>
        <div className="count" data-testid="count">
          {covered ? t('recordsThisYear', { n: activeRows.length }) : t('outOfRange')}
        </div>
        {notice && <div className={`notice notice-${notice.kind}`} role="status" data-testid="notice">{notice.text}</div>}
      </header>

      <nav className="tools">
        <button className={`btn-text ${autoRotate ? 'on' : ''}`} aria-pressed={autoRotate} onClick={() => setAutoRotate((v) => !v)}>{t('autoRotate')}</button>
        <button className="btn-text" onClick={() => setResetRequest((n) => n + 1)}>{t('resetView')}</button>
        <button className="btn-text" onClick={() => setShowSources(true)}>{t('sources')}</button>
        <select className="lang" aria-label={t('language')} data-testid="lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </nav>

      {selectedName !== null && (
        <PolityCard
          ds={ds}
          name={ds.names[selectedName]}
          row={selectedRow}
          year={year}
          onFocus={() => selectedRow && setFocusRequest({ row: selectedRow, nonce: Date.now() })}
          onClose={() => setSelectedName(null)}
        />
      )}

      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <b>{displayName(ds.names[hover.row.n], lang)}</b>
          <span>{formatYearRange(ds.names[hover.row.n].from, ds.names[hover.row.n].to, lang)}</span>
        </div>
      )}

      <footer className="dock">
        <div className="controls">
          <button className="play" onClick={() => setPlaying((p) => !p)} aria-label={t(playing ? 'pause' : 'play')} data-testid="play">
            {playing ? (
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.3-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" /></svg>
            )}
          </button>
          <div className="speeds" role="group" aria-label={t('speedGroup')}>
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? 'on' : ''} aria-pressed={s === speed} onClick={() => setSpeed(s)}>{s}</button>
            ))}
            <span>{t('yearsPerSec')}</span>
          </div>
          <div className="legend">
            <span><i className="swatch swatch-land" />{t('legendLand')}</span>
            <span><i className="swatch swatch-gap" />{t('legendGap')}</span>
          </div>
        </div>
        <Timeline pos={pos} coverage={ds.coverage} onScrub={handleScrub} onScrubStart={handleScrubStart} />
        <p className="attribution">
          {t('attribution')}
        </p>
      </footer>

      {showSources && <SourcesDialog ds={ds} onClose={() => setShowSources(false)} />}
    </>
  );
}
