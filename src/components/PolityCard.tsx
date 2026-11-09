import type { Dataset, PolityName, Row } from '../lib/data';
import { displayName } from '../lib/data';
import { useI18n } from '../i18n';
import { formatYear, formatYearRange } from '../lib/years';

interface Props {
  ds: Dataset;
  name: PolityName;
  row: Row | null;
  year: number;
  onFocus: () => void;
  onClose: () => void;
}

export function PolityCard({ ds, name, row, year, onFocus, onClose }: Props) {
  const { t, lang } = useI18n();
  const parentId = row?.memberOf ? ds.nameIds.get(row.memberOf) : undefined;
  const parent = parentId !== undefined ? displayName(ds.names[parentId], lang) : row?.memberOf;
  const range = (from: number, to: number) => formatYearRange(from, to, lang);
  const subtitle = lang === 'en' ? null : name.zh ? name.en : t('noTranslation');
  return (
    <aside className="card" aria-label={t('polityInfo')}>
      <button className="icon-btn card-close" onClick={onClose} aria-label={t('close')}>×</button>
      <h2>{displayName(name, lang)}</h2>
      {subtitle && <p className="card-en">{subtitle}</p>}
      {row ? (
        <dl>
          <dt>{t('recordApplies')}</dt>
          <dd>{range(row.from, row.to)}</dd>
          <dt>{t('datasetYears')}</dt>
          <dd>{range(name.from, name.to)}</dd>
          <dt>{t('areaLabel')}</dt>
          <dd>{t('areaValue', { n: row.area.toLocaleString(lang) })}</dd>
          {parent && (<><dt>{t('memberOf')}</dt><dd>{parent}</dd></>)}
        </dl>
      ) : (
        <p className="card-empty">{t('noRecordThisYear', { year: formatYear(year, lang), range: range(name.from, name.to) })}</p>
      )}
      <p className="card-note">{t('cardNote')}</p>
      {row && (
        <div className="card-links">
          <button className="btn-text" onClick={onFocus}>{t('focus')}</button>
          {row.wikipedia && <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(row.wikipedia.replaceAll(' ', '_'))}`} target="_blank" rel="noreferrer">Wikipedia</a>}
          {row.wikidata && <a href={`https://www.wikidata.org/wiki/${encodeURIComponent(row.wikidata)}`} target="_blank" rel="noreferrer">Wikidata</a>}
          {row.seshat && <a href={`https://seshat-db.com/core/polity/${encodeURIComponent(row.seshat)}`} target="_blank" rel="noreferrer">Seshat</a>}
        </div>
      )}
    </aside>
  );
}
