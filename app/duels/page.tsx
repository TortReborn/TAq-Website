'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BookOpen, Bot, Castle, Grid3x3, Layers, LibraryBig, Swords, X } from 'lucide-react';
import CardFace from '@/components/duel/CardFace';
import DeckBuilder from '@/components/duel/DeckBuilder';
import Guide from '@/components/duel/Guide';
import GridGuide from '@/components/duel/GridGuide';
import WarGuide from '@/components/duel/WarGuide';
import s from '@/components/duel/duel.module.css';
import gs from '@/components/duel/grid.module.css';
import { duelPost, useDuels, type DuelDeck, type DuelsData } from '@/hooks/useDuels';
import { useExecSession } from '@/hooks/useExecSession';
import { allCards, getCard } from '@/lib/duel/catalog';
import { validateDeck } from '@/lib/duel/deck';
import { tankElement } from '@/lib/duel/engine';
import type { MatchPayload, MatchSummary, Ruleset } from '@/lib/duel/store';
import { ELEMENT_INFO } from '@/lib/duel/text';
import type { CardDef, Element, Tier } from '@/lib/duel/types';

type Tab = 'play' | 'decks' | 'cards' | 'guide';
const TABS: { id: Tab; label: string; icon: typeof Swords }[] = [
  { id: 'play', label: 'Play', icon: Swords },
  { id: 'decks', label: 'Decks', icon: Layers },
  { id: 'cards', label: 'Cards', icon: LibraryBig },
  { id: 'guide', label: 'Guide', icon: BookOpen },
];
const TIER_RANK: Tier[] = ['token', 'normal', 'unique', 'rare', 'legendary', 'fabled', 'member', 'mythic'];
const WELCOME_KEY = 'duels.welcomed';
const RULESET_NAME: Record<Ruleset, string> = { duel: 'Classic duel', war: 'Three-Front War', grid: 'Warfront' };

/** A ruleset's badge in the match lists (none for the classic duel). */
function RulesetBadge({ ruleset }: { ruleset?: Ruleset }) {
  if (ruleset === 'war') return <span className={`${s.badge} ${s.badgeWar}`}>War</span>;
  if (ruleset === 'grid') return <span className={`${s.badge} ${gs.badgeGrid}`}>Warfront</span>;
  return null;
}

function Face({ uuid }: { uuid: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return uuid ? <img className={s.face} src={`https://mc-heads.net/avatar/${uuid}/24`} alt="" /> : <Bot size={20} />;
}

function deckElement(cards: string[], lookup: (slug: string) => CardDef | undefined): Element {
  return tankElement(cards.map(lookup).filter((c): c is CardDef => !!c));
}

function deckOptions(data: DuelsData) {
  const lookup = (slug: string) => data.memberCards[slug] ?? getCard(slug);
  return [
    ...data.starters.map(st => ({ value: `starter:${st.element}`, label: st.name, sub: 'Starter deck', element: st.element, friendly: true })),
    ...data.decks.map(d => ({
      value: `deck:${d.id}`,
      label: d.name,
      sub: `${d.cards.length} cards`,
      element: deckElement(d.cards, lookup),
      friendly: validateDeck(d.cards, data.owned, lookup).length === 0,
    })),
  ];
}

function choice(value: string) {
  const [kind, v] = value.split(':');
  return kind === 'starter' ? { starter: v } : { deckId: v };
}

/** The player's five best cards, or a showcase if they own none yet. */
function Showcase({ data }: { data: DuelsData }) {
  const cards = useMemo(() => {
    const lookup = (slug: string) => data.memberCards[slug] ?? getCard(slug);
    const owned = Object.keys(data.owned).map(lookup).filter((c): c is CardDef => !!c && !!c.image);
    const pool = owned.length >= 3 ? owned : allCards().filter(c => c.image && c.tier !== 'token');
    return [...pool]
      .sort((a, b) => TIER_RANK.indexOf(b.tier) - TIER_RANK.indexOf(a.tier) || b.cost - a.cost || a.slug.localeCompare(b.slug))
      .slice(0, 5);
  }, [data]);
  const n = cards.length;
  return (
    <div className={s.heroFan} aria-hidden>
      {cards.map((c, i) => {
        const off = i - (n - 1) / 2;
        return (
          <div key={c.slug} style={{ '--x': `calc(var(--card-w) * ${off * 0.55})`, '--rot': `${off * 7}deg`, '--y': `${off * off * 5}px`, zIndex: 10 - Math.abs(Math.round(off)) } as CSSProperties}>
            <CardFace def={c} />
          </div>
        );
      })}
    </div>
  );
}

function Play({ data, refresh }: { data: DuelsData; refresh: () => void }) {
  const router = useRouter();
  const options = deckOptions(data);
  const [deck, setDeck] = useState(options[0]?.value ?? 'starter:earth');
  const [opponent, setOpponent] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [challengeRules, setChallengeRules] = useState<Ruleset>('duel');
  const [gridSize, setGridSize] = useState<5 | 7>(7);
  const picked = options.find(o => o.value === deck);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const practice = (ruleset: Ruleset) => run(async () => {
    const res = await duelPost<{ match: MatchPayload }>('/api/duels/matches', { mode: 'practice', deck: choice(deck), ruleset, ...(ruleset === 'grid' ? { size: gridSize } : {}) });
    router.push(`/duels/${res.match.id}`);
  });

  const challenge = (open: boolean) => run(async () => {
    await duelPost('/api/duels/matches', { mode: 'friendly', deck: choice(deck), opponent: open ? undefined : opponent, ruleset: challengeRules });
    setOpponent('');
    const what = challengeRules === 'duel' ? 'challenge' : `${RULESET_NAME[challengeRules]} challenge`;
    setMsg(open ? `Open ${what} posted. Any member can take it for the next 24 hours.` : `${what.charAt(0).toUpperCase() + what.slice(1)} sent.`);
    refresh();
  });

  const accept = (id: string) => run(async () => {
    const res = await duelPost<{ match: MatchPayload }>(`/api/duels/matches/${id}/accept`, { deck: choice(deck) });
    router.push(`/duels/${res.match.id}`);
  });

  const cancel = (id: string) => run(async () => {
    await duelPost(`/api/duels/matches/${id}/cancel`);
    refresh();
  });

  const row = (m: MatchSummary) => (
    <Link key={m.id} href={`/duels/${m.id}`} className={s.listItem} style={{ textDecoration: 'none', color: 'inherit' }}>
      <span className={s.row}>
        <Face uuid={m.opponent?.uuid ?? ''} />
        {m.mode === 'practice' ? 'Practice vs bot' : `vs ${m.opponent?.ign ?? '?'}`}
        <RulesetBadge ruleset={m.ruleset} />
      </span>
      {m.status === 'active'
        ? <span className={`${s.badge} ${m.yourTurn ? s.badgeTurn : ''}`}>{m.yourTurn ? 'Your move' : 'Waiting'}</span>
        : <span className={s.badge}>{m.winner === null ? 'Draw' : m.winner === m.you ? 'Won' : 'Lost'}</span>}
    </Link>
  );

  return (
    <div className={s.playGrid}>
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Choose a deck</h2>
        <div className={s.deckPick} role="radiogroup" aria-label="Deck">
          {options.map(o => {
            const el = ELEMENT_INFO[o.element];
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={deck === o.value}
                className={`${s.deckTile} ${deck === o.value ? s.deckTileOn : ''}`}
                style={{ '--el': el.color } as CSSProperties}
                onClick={() => setDeck(o.value)}
                title={`${el.name} tank`}
              >
                <span className={s.deckTileGlyph}>{el.glyph}</span>
                <span style={{ minWidth: 0 }}>
                  <span className={s.deckTileName}>{o.label}</span>
                  <span className={`${s.deckTileSub} readable-font`}>{o.sub}{o.friendly ? '' : ' · practice only'}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className={s.cta} style={{ marginTop: '1rem' }}>
          <button type="button" className={`${s.btn} ${s.btnPrimary} ${s.btnBig}`} onClick={() => practice('duel')} disabled={busy}>
            <Bot size={20} /> Practice vs bot
          </button>
          <button type="button" className={`${s.btn} ${s.btnBig} ${s.btnWar}`} onClick={() => practice('war')} disabled={busy}>
            <Castle size={20} /> Three-Front War <span className={s.betaTag}>beta</span>
          </button>
          <span className={gs.gridEntry}>
            <button type="button" className={`${s.btn} ${s.btnBig} ${gs.btnGrid}`} onClick={() => practice('grid')} disabled={busy}>
              <Grid3x3 size={20} /> Warfront <span className={s.betaTag}>beta</span>
            </button>
            <span className={gs.sizePick} role="radiogroup" aria-label="Warfront board size">
              {([7, 5] as const).map(n => (
                <button key={n} type="button" role="radio" aria-checked={gridSize === n} onClick={() => setGridSize(n)} title={n === 5 ? 'The small board: quicker games' : 'The full board'}>{n}×{n}</button>
              ))}
            </span>
          </span>
          <p className="readable-font">No clock, any cards, nothing at stake. Three-Front War is the lane battle; Warfront is turn-by-turn on a grid, like chess on the war map. See the Guide tab.</p>
        </div>
        <div className={s.row} style={{ marginTop: '1rem' }}>
          <input
            className={s.input}
            placeholder="Member IGN"
            value={opponent}
            maxLength={16}
            onChange={e => setOpponent(e.target.value)}
            style={{ flex: '1 1 160px' }}
            aria-label="Member to challenge"
          />
          <select className={s.select} value={challengeRules} onChange={e => setChallengeRules(e.target.value as Ruleset)} aria-label="Game to challenge with">
            <option value="duel">Classic duel</option>
            <option value="war">Three-Front War</option>
            <option value="grid">Warfront (7×7)</option>
          </select>
          <button type="button" className={s.btn} onClick={() => challenge(false)} disabled={busy || !opponent.trim() || !picked?.friendly}>Challenge</button>
          <button type="button" className={s.btn} onClick={() => challenge(true)} disabled={busy || !picked?.friendly}>Open challenge</button>
        </div>
        {!picked?.friendly && <p className={`${s.muted} readable-font`} style={{ marginTop: '0.5rem' }}>That deck has cards you do not own, so it can only be used in practice.</p>}
        {msg && <p className={`${s.muted} readable-font`} role="status" style={{ marginTop: '0.5rem' }}>{msg}</p>}
      </section>

      <section className={s.panel}>
        <h2 className={s.panelTitle}>Challenges</h2>
        <div className={s.list}>
          {data.incoming.map(c => (
            <div key={c.id} className={s.listItem}>
              <span className={s.row}>
                <Face uuid={c.from.uuid} /> {c.from.ign} {c.direct ? 'challenged you' : 'wants a duel'}
                <RulesetBadge ruleset={(c as { ruleset?: Ruleset }).ruleset} />
              </span>
              <span className={s.row}>
                <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => accept(c.id)} disabled={busy || !picked?.friendly}>Accept</button>
                {c.direct && <button type="button" className={s.btn} onClick={() => cancel(c.id)} disabled={busy}>Decline</button>}
              </span>
            </div>
          ))}
          {data.outgoing.map(c => (
            <div key={c.id} className={s.listItem}>
              <span className={s.row}>
                {c.to ? `You challenged ${c.to}` : 'Your open challenge'}
                <RulesetBadge ruleset={(c as { ruleset?: Ruleset }).ruleset} />
              </span>
              <button type="button" className={s.btn} onClick={() => cancel(c.id)} disabled={busy}>Withdraw</button>
            </div>
          ))}
          {!data.incoming.length && !data.outgoing.length && <p className={`${s.muted} readable-font`}>No open challenges. Accepting one uses the deck you picked.</p>}
        </div>
      </section>

      <section className={s.panel}>
        <h2 className={s.panelTitle}>Your duels</h2>
        <div className={s.list}>
          {data.active.map(row)}
          {!data.active.length && <p className={`${s.muted} readable-font`}>Nothing in progress.</p>}
        </div>
        <h2 className={s.panelTitle} style={{ marginTop: '1.25rem' }}>Recent results</h2>
        <div className={s.list}>
          {data.recent.map(row)}
          {!data.recent.length && <p className={`${s.muted} readable-font`}>No finished duels this week.</p>}
        </div>
      </section>
    </div>
  );
}

function Decks({ data, refresh }: { data: DuelsData; refresh: () => void }) {
  const [editing, setEditingRaw] = useState<DuelDeck | 'new' | null>(null);
  // Remount the editor only when a deck is opened, not when saving gives a
  // new deck its id (that would wipe the "Saved." confirmation).
  const [opened, setOpened] = useState(0);
  const open = (d: DuelDeck | 'new' | null) => { setEditingRaw(d); setOpened(n => n + 1); };
  const lookup = (slug: string) => data.memberCards[slug] ?? getCard(slug);
  if (editing) {
    return (
      <DeckBuilder
        key={opened}
        owned={data.owned}
        memberCards={data.memberCards}
        deck={editing === 'new' ? null : editing}
        onSaved={d => { setEditingRaw(d); refresh(); }}
        onDeleted={() => { open(null); refresh(); }}
        onClose={() => open(null)}
      />
    );
  }
  const tile = (key: string, name: string, cards: string[], sub: string, onClick: () => void, action: string) => {
    const el = ELEMENT_INFO[deckElement(cards, lookup)];
    return (
      <button key={key} type="button" className={s.deckTile} style={{ '--el': el.color, padding: '0.8rem' } as CSSProperties} onClick={onClick}>
        <span className={s.deckTileGlyph}>{el.glyph}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className={s.deckTileName}>{name}</span>
          <span className={`${s.deckTileSub} readable-font`}>{sub} · {el.name} tank</span>
        </span>
        <span className={s.badge}>{action}</span>
      </button>
    );
  };
  return (
    <div className={s.grid2}>
      <section className={s.panel}>
        <div className={s.row} style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 className={s.panelTitle} style={{ margin: 0 }}>Your decks</h2>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => open('new')}>New deck</button>
        </div>
        <div className={s.list}>
          {data.decks.map(d => tile(d.id, d.name, d.cards, `${d.cards.length} cards`, () => open(d), 'Edit'))}
          {!data.decks.length && <p className={`${s.muted} readable-font`}>No decks yet. Start from scratch, or copy a starter.</p>}
        </div>
      </section>
      <section className={s.panel}>
        <h2 className={s.panelTitle}>Starter decks</h2>
        <p className={`${s.muted} readable-font`} style={{ marginBottom: '0.75rem' }}>Free for everyone, built from normal cards. Copy one to make it your own.</p>
        <div className={s.list}>
          {data.starters.map(st => tile(st.id, st.name, st.cards, 'Starter', () => open({ id: '', name: `${st.name} (copy)`, cards: st.cards, updatedAt: '' } as DuelDeck), 'Copy'))}
        </div>
      </section>
    </div>
  );
}

function readWelcomed(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

export default function DuelsPage() {
  const { authenticated, loading: authLoading } = useExecSession();
  const router = useRouter();
  const { data, error, refresh } = useDuels(authenticated);
  const [tab, setTabRaw] = useState<Tab>('play');
  const [welcome, setWelcome] = useState(false);
  const [guideKind, setGuideKind] = useState<'duel' | 'war' | 'grid'>('duel');

  useEffect(() => {
    if (!authLoading && !authenticated) router.push('/login');
  }, [authLoading, authenticated, router]);

  // ?tab=guide deep links from the battle screen's help.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && TABS.some(x => x.id === t)) setTabRaw(t);
    const gk = new URLSearchParams(window.location.search).get('guide');
    if (gk === 'war' || gk === 'grid') setGuideKind(gk);
    setWelcome(!readWelcomed());
  }, []);

  const setTab = (t: Tab) => {
    setTabRaw(t);
    window.history.replaceState(null, '', t === 'play' ? '/duels' : `/duels?tab=${t}`);
  };

  const dismissWelcome = () => {
    setWelcome(false);
    try {
      window.localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      // Storage blocked: the banner just shows again next visit.
    }
  };

  const ownedCount = useMemo(() => (data ? Object.keys(data.owned).length : 0), [data]);

  return (
    <main className={s.page}>
      {(tab === 'play' || tab === 'guide') && (
      <header className={s.hero}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 className={s.heroTitle}>Tank Duels</h1>
          <p className={`${s.heroSub} readable-font`}>
            Battle other members with the cards you reel in the Discord bot. Fair by design: rarity buys variety, not raw power.
          </p>
          {data && (
            <div className={s.heroStats}>
              <div className={s.stat}><b>{data.record.wins}</b><span>Wins</span></div>
              <div className={s.stat}><b>{data.record.losses}</b><span>Losses</span></div>
              <div className={s.stat}><b>{ownedCount}</b><span>Cards owned</span></div>
              <div className={s.stat}><b>{data.decks.length}</b><span>Decks</span></div>
            </div>
          )}
        </div>
        {data && <Showcase data={data} />}
      </header>
      )}

      {welcome && tab !== 'guide' && (
        <div className={s.banner} role="note">
          <BookOpen size={22} />
          <div className={`${s.bannerText} readable-font`}>
            <b>New to Tank Duels?</b> The guide walks through a card, a turn and combat in a few minutes.
          </div>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => { setTab('guide'); dismissWelcome(); }}>Read the guide</button>
          <button type="button" className={s.coachClose} onClick={dismissWelcome} aria-label="Dismiss"><X size={18} /></button>
        </div>
      )}

      <div className={s.tabs} role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={17} /> {t.label}
          </button>
        ))}
      </div>
      {error && <p className={s.error}>{error}</p>}
      {!data && !error && tab !== 'guide' && <p className={s.muted}>Loading...</p>}
      {data && tab === 'play' && <Play data={data} refresh={refresh} />}
      {data && tab === 'decks' && <Decks data={data} refresh={refresh} />}
      {data && tab === 'cards' && <DeckBuilder owned={data.owned} memberCards={data.memberCards} deck={null} gallery />}
      {tab === 'guide' && (
        <>
          <div className={s.filters} role="tablist" aria-label="Which game" style={{ marginBottom: '1rem' }}>
            <button type="button" role="tab" aria-selected={guideKind === 'duel'} className={guideKind === 'duel' ? `${s.chip} ${s.chipOn}` : s.chip} onClick={() => setGuideKind('duel')}>Classic duel</button>
            <button type="button" role="tab" aria-selected={guideKind === 'war'} className={guideKind === 'war' ? `${s.chip} ${s.chipOn}` : s.chip} onClick={() => setGuideKind('war')}>Three-Front War (beta)</button>
            <button type="button" role="tab" aria-selected={guideKind === 'grid'} className={guideKind === 'grid' ? `${s.chip} ${s.chipOn}` : s.chip} onClick={() => setGuideKind('grid')}>Warfront (beta)</button>
          </div>
          {guideKind === 'war' ? <WarGuide /> : guideKind === 'grid' ? <GridGuide /> : <Guide />}
        </>
      )}
    </main>
  );
}
