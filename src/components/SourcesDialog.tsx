import { Fragment, useEffect, useRef } from 'react';
import type { Dataset } from '../lib/data';
import { useI18n, type MessageKey } from '../i18n';

const ext = { target: '_blank', rel: 'noreferrer' };

/** 訊息內的 **粗體** 標記。 */
function Rich({ text }: { text: string }) {
  return <>{text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>))}</>;
}

export function SourcesDialog({ ds, onClose }: { ds: Dataset; onClose: () => void }) {
  const { t, lang } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const { stats, source } = ds.file;
  const list = (keys: MessageKey[]) => <ul>{keys.map((k) => <li key={k}><Rich text={t(k)} /></li>)}</ul>;
  return (
    <dialog ref={ref} className="sources" onClose={onClose} aria-labelledby="sources-title">
      <button className="icon-btn card-close" onClick={() => ref.current?.close()} aria-label={t('close')}>×</button>
      <h2 id="sources-title">{t('sources')}</h2>

      <h3>{t('srcBorders')}</h3>
      <p>
        <a href="https://github.com/Seshat-Global-History-Databank/cliopatria" {...ext}>Cliopatria {source.version}</a>
        {' '}(Seshat Global History Databank) · {t('srcLicense')}: <a href="https://creativecommons.org/licenses/by/4.0/" {...ext}>CC BY 4.0</a>
      </p>
      <p>
        {t('srcCite')}: Bennett, J. S. et al. (2025). <a href="https://doi.org/10.1038/s41597-025-04516-9" {...ext}>Cliopatria – A geospatial database of world-wide political entities from 3400BCE to 2024CE.</a> <i>Scientific Data</i> 12, 247.
      </p>
      <p>{t('srcChanges', { km: stats.simplifyIntervalM / 1000, rows: stats.rows.toLocaleString(lang), polities: stats.polities.toLocaleString(lang), fixes: stats.yearZeroFixes })}</p>

      <h3>{t('srcCoverage')}</h3>
      {list(['srcCov1', 'srcCov2', 'srcCov3', 'srcCov4'])}
      <h3>{t('srcReading')}</h3>
      {list(['srcRead1', 'srcRead2', 'srcRead3', 'srcRead4'])}
      <h3>{t('srcBase')}</h3>
      {list(['srcBase1', 'srcBase2'])}
    </dialog>
  );
}
