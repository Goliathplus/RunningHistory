import { memo, useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import { BATTLE_WINDOW, battleName, sideLabel, type Battle, type BattleData, type Side, type WindowItem } from '../lib/battles';
import type { Dataset } from '../lib/data';
import { formatYear, type Lang } from '../lib/years';

function battleDate(b: Battle, lang: Lang): string {
  if (!b.date) return formatYear(b.y, lang);
  return new Date(`${b.date}T00:00:00Z`).toLocaleDateString(lang, { dateStyle: 'long', timeZone: 'UTC' });
}

const links = { target: '_blank', rel: 'noreferrer' };

function Details({ ds, data, battle, onLocate }: { ds: Dataset; data: BattleData; battle: Battle; onLocate: () => void }) {
  const { t, lang } = useI18n();
  const side = (s: Side[]) => s.map((x) => sideLabel(x, ds, lang)).join(lang === 'en' ? ', ' : '、');
  const date = battleDate(battle, lang);
  const war = battle.war ? data.wars[battle.war][lang === 'en' ? 0 : 1] : null;
  return (
    <div className="battle-details" data-testid="battle-details">
      <dl>
        <dt>{t('battleDate')}</dt>
        <dd>{battle.started ? t('battleStarted', { date }) : date}</dd>
        {war && (<><dt>{t('battleWar')}</dt><dd>{war}</dd></>)}
        <dt>{t('battleSides')}</dt>
        <dd className="sides">
          <span><i className="side-swatch side-a" />{side(battle.a)}</span>
          <span><i className="side-swatch side-b" />{side(battle.b)}</span>
        </dd>
        <dt>{t('battleResult')}</dt>
        <dd>{battle.win === 'd' ? t('resultDisputed') : t('resultWinner', { side: side(battle[battle.win]) })}</dd>
      </dl>
      {(battle.dateUncertain || battle.locUncertain) && (
        <p className="battle-tags">
          {battle.dateUncertain && <span>{t('tagDate')}</span>}
          {battle.locUncertain && <span>{t('tagLoc')}</span>}
        </p>
      )}
      {war && <p className="battle-seq"><i />{t('sequenceLabel')}</p>}
      <div className="card-links">
        <button className="btn-text" onClick={onLocate}>{t('focus')}</button>
        {battle.wp && <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(battle.wp)}`} {...links}>Wikipedia</a>}
        <a href={`https://www.wikidata.org/wiki/${battle.q}`} {...links}>Wikidata</a>
      </div>
    </div>
  );
}

interface Props {
  ds: Dataset;
  data: BattleData;
  items: WindowItem[];
  selected: Battle | null;
  hidden: boolean;
  onSelect: (b: Battle) => void;
  onHover: (q: string | null) => void;
  onLocate: (b: Battle) => void;
}

function BattlePanelImpl({ ds, data, items, selected, hidden, onSelect, onHover, onLocate }: Props) {
  const { t, lang } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) listRef.current?.querySelector(`[data-battle="${selected.q}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <section className={`battle-panel ${hidden ? 'mobile-hidden' : ''}`} aria-label={t('battles')} data-testid="battle-panel">
      <h2>{t('battles')}<small>{t('battlesWindow', { n: BATTLE_WINDOW })}</small></h2>
      <div className="battle-list" ref={listRef} onMouseLeave={() => onHover(null)}>
        {items.length === 0 && <p className="battle-empty">{t('battlesEmpty')}</p>}
        {items.map(({ battle, age }) => {
          const isSelected = selected?.q === battle.q;
          return (
            <div key={battle.q} className={`battle-row ${isSelected ? 'selected' : ''}`} style={{ opacity: isSelected ? 1 : 1 - (age / BATTLE_WINDOW) * 0.55 }}>
              <button
                data-battle={battle.q}
                aria-expanded={isSelected}
                onClick={() => onSelect(battle)}
                onMouseEnter={() => onHover(battle.q)}
                onFocus={() => onHover(battle.q)}
                onBlur={() => onHover(null)}
              >
                <span className="battle-year">{battle.y < 0 ? t('tickBce', { y: -battle.y }) : battle.y}</span>
                <span className="battle-name">{battleName(battle, lang)}</span>
              </button>
              {isSelected && <Details ds={ds} data={data} battle={battle} onLocate={() => onLocate(battle)} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const BattlePanel = memo(BattlePanelImpl);
