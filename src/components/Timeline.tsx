import { memo, useMemo } from 'react';
import type { Dataset } from '../lib/data';
import { useI18n } from '../i18n';
import { DATA_START_YEAR, formatYear, fracToPos, POS_MAX, POS_MIN, posToFrac, posToYear, yearToPos } from '../lib/years';

const TICK_YEARS = [-3000, -2000, -1000, -500, 1, 500, 1000, 1500, 1800, 1900, 2024];
const SLIDER_STEPS = 20000;

const CoverageChart = memo(function CoverageChart({ coverage, label }: { coverage: Dataset['coverage']; label: (max: number) => string }) {
  const { line, area, max } = useMemo(() => {
    const max = Math.max(...coverage.map((c) => c.count));
    const pts = coverage.map((c) => `${(posToFrac(c.pos) * 1000).toFixed(1)},${(40 - (Math.sqrt(c.count) / Math.sqrt(max)) * 38).toFixed(1)}`);
    const first = posToFrac(coverage[0].pos) * 1000;
    return { line: pts.join(' '), area: `${first},40 ${pts.join(' ')} 1000,40`, max };
  }, [coverage]);
  return (
    <svg className="coverage" viewBox="0 0 1000 40" preserveAspectRatio="none" role="img" aria-label={label(max)}>
      <polygon points={area} className="coverage-area" />
      <polyline points={line} className="coverage-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

interface Props {
  pos: number;
  coverage: Dataset['coverage'];
  onScrub: (pos: number) => void;
  onScrubStart: () => void;
}

function TimelineImpl({ pos, coverage, onScrub, onScrubStart }: Props) {
  const { t, lang } = useI18n();
  const gapWidth = posToFrac(yearToPos(DATA_START_YEAR)) * 100;
  const frac = posToFrac(pos);
  return (
    <div className="timeline">
      <div className="track">
        <div className="gap" style={{ width: `${gapWidth}%` }} title={t('gapTitle')} />
        <CoverageChart coverage={coverage} label={(max) => t('coverageAria', { max })} />
        <input
          type="range"
          className="scrubber"
          aria-label={t('timeline')}
          aria-valuetext={formatYear(posToYear(pos), lang)}
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={Math.round(frac * SLIDER_STEPS)}
          onPointerDown={onScrubStart}
          onChange={(e) => onScrub(Math.min(POS_MAX, Math.max(POS_MIN, Math.round(fracToPos(Number(e.target.value) / SLIDER_STEPS)))))}
        />
      </div>
      <div className="ticks" aria-hidden="true">
        {TICK_YEARS.map((y) => (
          <span key={y} style={{ left: `${posToFrac(yearToPos(y)) * 100}%` }}>{y < 0 ? t('tickBce', { y: -y }) : y}</span>
        ))}
      </div>
    </div>
  );
}

export const Timeline = memo(TimelineImpl);
