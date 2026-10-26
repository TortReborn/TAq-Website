'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Search, X } from 'lucide-react';
import { duelPost, type DuelDeck } from '@/hooks/useDuels';
import { allCards, getCard } from '@/lib/duel/catalog';
import { copyLimit, MAX_RENOWNED, RENOWNED, validateDeck, type Owned } from '@/lib/duel/deck';
import { DECK_SIZE, tankElement, tankOf } from '@/lib/duel/engine';
import { abilityText, ELEMENT_INFO, TIER_INFO } from '@/lib/duel/text';
import type { CardDef, Element, Tier } from '@/lib/duel/types';
import { ELEMENTS } from '@/lib/duel/types';
import CardFace from './CardFace';
import s from './duel.module.css';

const TIERS: Tier[] = ['normal', 'unique', 'rare', 'legendary', 'fabled', 'mythic', 'member'];
const PAGE = 240;

interface Props {
  owned: Owned;
  memberCards: Record<string, CardDef>;
  deck: DuelDeck | null;
  /** Browse-only card gallery: no deck panel. */
  gallery?: boolean;
  onSaved?: (d: DuelDeck) => void;
  onDeleted?: () => void;
  onClose?: () => void;
}

export default function DeckBuilder({ owned, memberCards, deck, gallery, onSaved, onDeleted, onClose }: Props) {
  const [name, setName] = useState(deck?.name ?? 'New deck');
  const [cards, setCards] = useState<string[]>(deck?.cards ?? []);
  const [elements, setElements] = useState<Set<Element>>(new Set());
  const [tiers, setTiers] = useState<Set<Tier>>(new Set());
  const [ownedOnly, setOwnedOnly] = useState(!gallery);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<CardDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const lookup = (slug: string) => memberCards[slug] ?? getCard(slug);
  const available = (c: CardDef) => c.tier === 'normal' || (owned[c.slug] ?? 0) > 0;

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...allCards(), ...Object.values(memberCards)]
      .filter(c => c.tier !== 'token')
      .filter(c => !elements.size || elements.has(c.element))
      .filter(c => !tiers.size || tiers.has(c.tier))
      .filter(c => !ownedOnly || available(c))
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.abilities.some(a => a.name?.toLowerCase().includes(q)) || c.keywords.some(k => k.includes(q)))
      .sort((a, b) => a.cost - b.cost || TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, tiers, ownedOnly, query, memberCards, owned]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [cards]);

  const defs = cards.map(lookup).filter((c): c is CardDef => !!c);
  const practiceErrors = validateDeck(cards, null, lookup);
  const friendlyErrors = validateDeck(cards, owned, lookup);
  const renowned = defs.filter(c => RENOWNED.has(c.tier)).length;
  const curve = Array.from({ length: 8 }, (_, i) => defs.filter(c => Math.min(8, Math.max(1, c.cost)) === i + 1).length);
  const curveMax = Math.max(1, ...curve);
  const mix = ELEMENTS.map(el => ({ el, n: defs.filter(c => c.element === el).length })).filter(x => x.n > 0);
  const tankEl = defs.length ? tankElement(defs) : null;
  const tank = tankEl ? tankOf({ tank: tankEl }) : undefined;

  function add(c: CardDef) {
    setFocus(c);
    if (gallery) return;
    if (cards.length >= DECK_SIZE) return setMsg(`A deck holds ${DECK_SIZE} cards.`);
    if ((counts.get(c.slug) ?? 0) >= copyLimit(c)) return setMsg(`${c.name}: at most ${copyLimit(c)}.`);
    if (RENOWNED.has(c.tier) && renowned >= MAX_RENOWNED) return setMsg(`At most ${MAX_RENOWNED} legendary or rarer cards.`);
    setMsg(null);
    setCards([...cards, c.slug]);
  }

  function remove(slug: string) {
    const i = cards.lastIndexOf(slug);
    if (i >= 0) setCards([...cards.slice(0, i), ...cards.slice(i + 1)]);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const url = deck?.id ? `/api/duels/decks/${deck.id}` : '/api/duels/decks';
      const res = await duelPost<{ deck: DuelDeck }>(url, { name, cards }, deck?.id ? 'PUT' : 'POST');
      onSaved?.(res.deck);
      setMsg('Saved.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeDeck() {
    if (!deck?.id || !confirm(`Delete ${deck.name}?`)) return;
    setBusy(true);
    try {
      await duelPost(`/api/duels/decks/${deck.id}`, undefined, 'DELETE');
      onDeleted?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = <T,>(set: Set<T>, v: T, put: (x: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    put(n);
    setLimit(PAGE);
  };

  const grouped = [...counts.entries()]
    .map(([slug, n]) => ({ def: lookup(slug)!, n }))
    .filter(x => x.def)
    .sort((a, b) => a.def.cost - b.def.cost || a.def.name.localeCompare(b.def.name));

  return (
    <div className={gallery ? '' : s.builder}>
      <div style={{ minWidth: 0 }}>
        <div className={`${s.panel} ${s.filterBar}`}>
          <div className={s.filters}>
            <span className={s.row} style={{ flex: '1 1 240px', gap: '0.4rem' }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input className={s.input} style={{ flex: 1 }} placeholder="Search name, move or keyword" value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE); }} />
            </span>
            <button type="button" className={`${s.chip} ${ownedOnly ? s.chipOn : ''}`} onClick={() => { setOwnedOnly(!ownedOnly); setLimit(PAGE); }}>
              {ownedOnly ? 'Usable by me' : 'All cards'}
            </button>
            <span className={`${s.muted} readable-font`}>{pool.length} cards</span>
          </div>
          <div className={s.filters}>
            {ELEMENTS.map(el => (
              <button key={el} type="button" className={`${s.chip} ${elements.has(el) ? s.chipOn : ''}`} onClick={() => toggle(elements, el, setElements)}>
                <span style={{ color: ELEMENT_INFO[el].color }}>{ELEMENT_INFO[el].glyph}</span> {ELEMENT_INFO[el].name}
              </button>
            ))}
            <span style={{ width: 8 }} />
            {TIERS.map(t => (
              <button key={t} type="button" className={`${s.chip} ${tiers.has(t) ? s.chipOn : ''}`} onClick={() => toggle(tiers, t, setTiers)}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: TIER_INFO[t].color, display: 'inline-block', border: '1px solid rgba(0,0,0,0.3)' }} /> {TIER_INFO[t].name}
              </button>
            ))}
          </div>
        </div>
        <div className={s.pool}>
          {pool.slice(0, limit).map(c => {
            const n = counts.get(c.slug) ?? 0;
            const have = available(c);
            return (
              <div key={c.slug} className={s.poolItem}>
                {n > 0 && <span className={s.count}>×{n}</span>}
                <CardFace
                  def={c}
                  dim={!have}
                  onClick={() => add(c)}
                  onHover={gallery ? undefined : () => setFocus(c)}
                  title={have ? (gallery ? 'Click to enlarge' : 'Click to add') : 'Not in your collection: practice only'}
                />
                {!have && <span className={`${s.badge} ${s.lock}`}>Not owned</span>}
              </div>
            );
          })}
        </div>
        {pool.length > limit && (
          <div className={s.row} style={{ justifyContent: 'center', marginTop: '1.25rem' }}>
            <button type="button" className={s.btn} onClick={() => setLimit(l => l + PAGE)}>Show more ({pool.length - limit} left)</button>
          </div>
        )}
        {!pool.length && <p className={s.muted}>No cards match those filters.</p>}
      </div>

      {!gallery && (
        <aside className={`${s.panel} ${s.deckList}`}>
          <input className={s.input} value={name} maxLength={40} onChange={e => setName(e.target.value)} aria-label="Deck name" style={{ fontSize: '1.1rem' }} />
          <div className={s.deckHead}>
            <b>{cards.length}<span className={s.muted}>/{DECK_SIZE}</span></b>
            <span className={`${s.muted} readable-font`}>Renowned {renowned}/{MAX_RENOWNED}</span>
          </div>
          <div className={s.deckMeter}><span style={{ width: `${Math.min(100, (cards.length / DECK_SIZE) * 100)}%` }} /></div>

          {tankEl && tank && (
            <div className="readable-font" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <b style={{ color: ELEMENT_INFO[tankEl].color }}>{ELEMENT_INFO[tankEl].glyph} {ELEMENT_INFO[tankEl].name} tank</b>
              {' · '}{tank.name} ({tank.cost ?? 0}): {abilityText(tank).text}
            </div>
          )}

          <div>
            <div className={s.curve} aria-label="Cost curve" style={{ marginTop: '1rem' }}>
              {curve.map((n, i) => (
                <div key={i} className={s.curveBar} style={{ height: `${(n / curveMax) * 100}%` }} title={`${n} at cost ${i + 1}${i === 7 ? '+' : ''}`}>
                  {n > 0 && <span>{n}</span>}
                </div>
              ))}
            </div>
            <div className={s.curveLabel}>{curve.map((_, i) => <span key={i}>{i === 7 ? '8+' : i + 1}</span>)}</div>
          </div>

          {mix.length > 0 && (
            <div className={s.elMix} aria-label="Element mix">
              {mix.map(x => <span key={x.el} title={`${ELEMENT_INFO[x.el].name}: ${x.n}`} style={{ flex: x.n, background: ELEMENT_INFO[x.el].color }} />)}
            </div>
          )}

          <div className={s.deckRows}>
            {grouped.map(({ def, n }) => (
              <button
                key={def.slug}
                type="button"
                className={s.deckRow}
                style={{ '--tier': TIER_INFO[def.tier].color, '--row-art': def.image ? `url("${def.image}")` : 'none' } as CSSProperties}
                onClick={() => remove(def.slug)}
                onMouseEnter={() => setFocus(def)}
                title="Click to remove one"
              >
                <span className={s.deckRowCost}>{def.cost}</span>
                <span style={{ color: ELEMENT_INFO[def.element].color }}>{ELEMENT_INFO[def.element].glyph}</span>
                <span className={s.deckRowName}>{def.name}</span>
                {!available(def) && <span className={s.badge}>practice</span>}
                {n > 1 && <span>×{n}</span>}
              </button>
            ))}
            {!cards.length && <p className={`${s.muted} readable-font`}>Click cards on the left to add them.</p>}
          </div>
          <p className={`${s.muted} readable-font`}>
            {practiceErrors.length > 0 ? practiceErrors[0]
              : friendlyErrors.length > 0 ? `Legal for practice. For friendly duels: ${friendlyErrors[0]}`
                : 'Legal for practice and friendly duels.'}
          </p>
          {msg && <p className={`${s.muted} readable-font`} role="status">{msg}</p>}
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={save} disabled={busy || practiceErrors.length > 0}>Save deck</button>
            {deck?.id && <button type="button" className={`${s.btn} ${s.btnDanger}`} onClick={removeDeck} disabled={busy}>Delete</button>}
            {onClose && <button type="button" className={s.btn} onClick={onClose}>Close</button>}
          </div>
          {focus && <div className={s.detail} style={{ '--card-w': '240px' } as CSSProperties}><CardFace def={focus} large /></div>}
        </aside>
      )}
      {gallery && focus && (
        <div className={s.overlay} onClick={() => setFocus(null)}>
          <div className={s.detail} style={{ '--card-w': 'min(320px, 86vw)' } as CSSProperties} onClick={e => e.stopPropagation()}>
            <CardFace def={focus} large />
            <button type="button" className={s.btn} onClick={() => setFocus(null)}><X size={16} /> Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
