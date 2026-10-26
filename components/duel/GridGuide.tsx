'use client';

// The Warfront guide. Like WarGuide.tsx, every number comes from the live
// config (GRID) or the grid text exports, and every diagram is computed with
// the engine's own geometry (moveOptions, network, deployTiles), so the guide
// cannot drift from the rules.

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Castle, Coins, Crosshair, Footprints, Gem, Link2, Map as MapIcon, Shield, Sparkles, Swords, Target, Trophy } from 'lucide-react';
import { ELEMENT_INFO } from '@/lib/duel/text';
import { ELEMENTS, type Element, type Keyword } from '@/lib/duel/types';
import {
  deployTiles, GRID, GRID_TURN_SECONDS, gridCombatText, gridEmeraldCost, gridHqText, gridKeywordText, gridMoveText, gridTankText, gridTerrainText,
  gridBraceText, gridComebackText, gridScoreText, gridTurnText, LAYOUTS, moveOptions, network,
  type GridBoard, type GridNode, type GridUnit, type Side, type Terrain,
} from '@/lib/duel/grid/client';
import { KEYWORD_ICON } from './CardFace';
import { PERK_ICON, nodeGivesText } from './gridShared';
import s from './duel.module.css';
import g from './grid.module.css';

const KEYWORDS: Keyword[] = ['guard', 'rush', 'ranged', 'stealth', 'shield', 'drain', 'pierce', 'regen'];
const pct = (x: number) => `${Math.round(x * 100)}%`;

// --- Synthetic boards for the diagrams --------------------------------------------

function blank(w: number, h: number): GridBoard {
  return { width: w, height: h, terrain: Array<Terrain>(w * h).fill('plain'), nodes: [], hq: [-1, -1], units: [], turn: 1, active: 0 };
}

function mkUnit(uid: string, side: Side, element: Element, tile: number): GridUnit {
  return {
    uid, slug: uid, side, element, tile, power: 3, health: 5, maxHealth: 5, keywords: [], speed: 0, shield: false, stealth: false,
    frozenUntil: 0, acted: false, fresh: false, bracedUntil: 0, aura: 0, boost: 0,
  };
}

/** A real layout as a board (the engine's parseLayout, on the client). */
function layoutBoard(size: 5 | 7, i = 0): GridBoard {
  const l = LAYOUTS[size][i];
  const b = blank(l.rows[0].length, l.rows.length);
  const hq: number[] = [];
  l.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const t = y * b.width + x;
    b.terrain[t] = ch === 'm' ? 'mountain' : ch === '~' ? 'water' : 'plain';
    if (ch === 'n' || ch === 'c') b.nodes.push({ tile: t, name: ch === 'c' ? 'City' : 'Node', city: ch === 'c', resource: null, owner: null });
    if (ch === 'H') hq.push(t);
  }));
  b.hq = [Math.max(...hq), Math.min(...hq)];
  return b;
}

// --- The diagram renderer ----------------------------------------------------------

interface Dia {
  b: GridBoard;
  /** Tiles to shade, by class. */
  mark?: Map<number, string>;
  /** Network tiles to link, per side. */
  net?: [Set<number>, Set<number>];
  label?: string;
  cell?: number;
  /** Text drawn on a tile (a glyph for a unit). */
  glyph?: Map<number, string>;
  arrows?: [number, number, string][];
}

function Diagram({ b, mark, net, label, cell = 18, glyph, arrows }: Dia) {
  const W = b.width;
  const H = b.height;
  const xy = (t: number): [number, number] => [(t % W) + 0.5, Math.floor(t / W) + 0.5];
  const unitAt = new Map(b.units.map(u => [u.tile, u]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W * cell} height={H * cell} className={g.dia} role="img" aria-label={label}>
      {b.terrain.map((tr, t) => {
        const [x, y] = xy(t);
        const cls = tr === 'mountain' ? g.diaMountain : tr === 'water' ? g.diaWater : (Math.floor(x) + Math.floor(y)) % 2 ? g.diaPlainB : g.diaPlainA;
        return <rect key={t} x={x - 0.5} y={y - 0.5} width={1} height={1} className={cls} />;
      })}
      {mark && [...mark].map(([t, c]) => { const [x, y] = xy(t); return <rect key={`m${t}`} x={x - 0.5} y={y - 0.5} width={1} height={1} className={c} />; })}
      {net && ([0, 1] as Side[]).map(side => {
        const set = net[side];
        const segs: ReactNode[] = [];
        for (const t of set) for (const n of [t + 1, t + W]) {
          if (!set.has(n) || (n === t + 1 && n % W === 0)) continue;
          const [x1, y1] = xy(t);
          const [x2, y2] = xy(n);
          segs.push(<line key={`${t}-${n}`} x1={x1} y1={y1} x2={x2} y2={y2} />);
        }
        return <g key={side} className={side === 0 ? g.diaNetMine : g.diaNetFoe}>{segs}</g>;
      })}
      {b.nodes.map(n => {
        const [x, y] = xy(n.tile);
        return <circle key={`n${n.tile}`} cx={x} cy={y} r={n.city ? 0.34 : 0.28} className={n.owner === 0 ? g.diaNodeMine : n.owner === 1 ? g.diaNodeFoe : g.diaNode} />;
      })}
      {b.hq.map((t, side) => {
        if (t < 0) return null;
        const [x, y] = xy(t);
        return <rect key={`h${side}`} x={x - 0.36} y={y - 0.36} width={0.72} height={0.72} rx={0.12} className={side === 0 ? g.diaHqMine : g.diaHqFoe} />;
      })}
      {arrows?.map(([a, c, cls], i) => {
        const [x1, y1] = xy(a);
        const [x2, y2] = xy(c);
        return <line key={`a${i}`} x1={x1} y1={y1} x2={x2 - (x2 - x1) * 0.3} y2={y2 - (y2 - y1) * 0.3} className={cls} />;
      })}
      {[...unitAt].map(([t, u]) => {
        const [x, y] = xy(t);
        return (
          <g key={`u${t}`}>
            <circle cx={x} cy={y} r={0.36} className={u.side === 0 ? g.diaUnitMine : g.diaUnitFoe} />
            {glyph?.get(t) && <text x={x} y={y + 0.16} textAnchor="middle" className={g.diaGlyph}>{glyph.get(t)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Where one unit of each element can go from the centre of a 7x7 board, computed with the engine's moveOptions. */
function MoveDiagram({ el }: { el: Element }) {
  const d = useMemo(() => {
    const b = blank(7, 7);
    const at = (x: number, y: number) => y * 7 + x;
    if (el === 'thunder') b.terrain[at(3, 1)] = 'mountain';
    if (el === 'air') { b.terrain[at(4, 2)] = 'mountain'; b.terrain[at(2, 4)] = 'mountain'; }
    if (el === 'earth' || el === 'fire') b.terrain[at(4, 2)] = 'mountain';
    if (el === 'water') for (let y = 0; y < 7; y++) b.terrain[at(3, y)] = 'water';
    const u = mkUnit('me', 0, el, at(3, 3));
    b.units = [u];
    if (el === 'thunder') b.units.push(mkUnit('ally', 0, 'earth', at(5, 3)));
    const moves = moveOptions(b, u);
    const mark = new Map(moves.map(m => [m.to, g.diaReach]));
    const glyph = new Map([[u.tile, ELEMENT_INFO[el].glyph]]);
    return { b, mark, glyph, n: moves.length };
  }, [el]);
  return <Diagram b={d.b} mark={d.mark} glyph={d.glyph} label={`${ELEMENT_INFO[el].name}: ${d.n} tiles in reach`} cell={17} />;
}

/** The snipe decision on a real layout: connected nodes armour the HQ; standing on a link cuts it. */
function ConnectionDiagram({ cut }: { cut: boolean }) {
  const d = useMemo(() => {
    const b = layoutBoard(7, 0);
    const [hx, hy] = [b.hq[0] % b.width, Math.floor(b.hq[0] / b.width)];
    const at = (x: number, y: number) => y * b.width + x;
    // A chain from the HQ up the middle to the city, and along the back row to a home node.
    const city = b.nodes.find(n => n.city)!;
    const home = b.nodes.filter(n => !n.city && Math.floor(n.tile / b.width) > b.height / 2).sort((x, y) => x.tile - y.tile)[0];
    city.owner = 0;
    if (home) home.owner = 0;
    const cx = city.tile % b.width;
    const chain: number[] = [];
    for (let y = hy - 1; y > Math.floor(city.tile / b.width); y--) chain.push(at(cx, y));
    if (home) {
      const nx = home.tile % b.width;
      for (let x = hx - 1; x >= nx; x--) chain.push(at(x, hy));
    }
    b.units = chain.map((t, i) => mkUnit(`c${i}`, 0, 'earth', t));
    if (cut) {
      // An enemy on the link below the city breaks that chain.
      const link = at(cx, Math.floor(city.tile / b.width) + 1);
      b.units = b.units.filter(u => u.tile !== link);
      b.units.push(mkUnit('foe', 1, 'fire', link));
    }
    const n0 = network(b, 0);
    const n1 = network(b, 1);
    return { b, net: [n0.tiles, n1.tiles] as [Set<number>, Set<number>], nodes: n0.nodes.length };
  }, [cut]);
  return (
    <figure className={g.diaFig}>
      <Diagram b={d.b} net={d.net} label={cut ? 'Chain cut' : 'Chain connected'} cell={22} />
      <figcaption className="readable-font">
        {cut ? <>An enemy stands on the link: <b>{d.nodes}</b> connected node{d.nodes === 1 ? '' : 's'}, HQ armour <b>{d.nodes * GRID.armourPerNode}</b>.</>
          : <>Both nodes chained to the HQ: HQ armour <b>{d.nodes * GRID.armourPerNode}</b>, +{d.nodes * GRID.nodeIncome} emeralds a turn.</>}
      </figcaption>
    </figure>
  );
}

/** Where you may deploy: your back row, and next to a connected node, never next to an enemy. */
function DeployDiagram() {
  const d = useMemo(() => {
    const b = layoutBoard(7, 0);
    const [hx, hy] = [b.hq[0] % b.width, Math.floor(b.hq[0] / b.width)];
    const at = (x: number, y: number) => y * b.width + x;
    const home = b.nodes.filter(n => !n.city && Math.floor(n.tile / b.width) > b.height / 2).sort((x, y) => x.tile - y.tile)[0];
    if (home) home.owner = 0;
    const nx = home ? home.tile % b.width : 0;
    const units: GridUnit[] = [];
    for (let x = hx - 1; x >= nx; x--) units.push(mkUnit(`c${x}`, 0, 'earth', at(x, hy)));
    // An enemy raider: tiles next to it are contested.
    units.push(mkUnit('foe', 1, 'fire', at(hx + 2, hy - 1)));
    b.units = units;
    const tiles = deployTiles(b, 0);
    const mark = new Map(tiles.map(x => [x.tile, x.forward ? g.diaForward : g.diaDeploy]));
    const net = network(b, 0);
    return { b, mark, net: [net.tiles, new Set<number>()] as [Set<number>, Set<number>] };
  }, []);
  return <Diagram b={d.b} mark={d.mark} net={d.net} label="Deploy tiles" cell={22} />;
}

/** Flanking and strike-back on a small board. */
function FlankDiagram() {
  const d = useMemo(() => {
    const b = blank(5, 4);
    const at = (x: number, y: number) => y * 5 + x;
    b.units = [mkUnit('t', 1, 'earth', at(2, 1)), mkUnit('a', 0, 'fire', at(2, 2)), mkUnit('f1', 0, 'earth', at(1, 1)), mkUnit('f2', 0, 'water', at(3, 0))];
    const glyph = new Map([[at(2, 2), '⚔'], [at(1, 1), '+1'], [at(3, 0), '+1']]);
    return { b, glyph, arrows: [[at(2, 2), at(2, 1), g.diaArrow]] as [number, number, string][] };
  }, []);
  return <Diagram b={d.b} glyph={d.glyph} arrows={d.arrows} label="Flanking" cell={30} />;
}

function Section({ id, icon, title, lead, children }: { id: string; icon: ReactNode; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={s.guideSection}>
      <h2 className={s.row}>{icon} {title}</h2>
      {lead && <p className={`${s.guideLead} readable-font`}>{lead}</p>}
      {children}
    </section>
  );
}

function Lines({ rows }: { rows: { name: string; text: string }[] }) {
  return (
    <div className={`${s.tips} readable-font`}>
      {rows.map(r => <div key={r.name} className={s.tip}><span><b>{r.name}.</b> {r.text}</span></div>)}
    </div>
  );
}

/** The rules on one screen, for the in-game help overlay. */
export function QuickGridRules() {
  return (
    <div className={`${s.quickRules} readable-font`}>
      <p>
        Destroy the enemy HQ ({GRID.hqHp} health){GRID.scoreTarget > 0 ? <>, or be first to <b>{GRID.scoreTarget} points</b>: your connected nodes score at the start of each of your turns</> : null}. Turns alternate; each turn you get {GRID.orders} orders ({GRID.firstOrders} for the first player on turn 1).
        After {GRID.turnLimit} turns each, {GRID.scoreTarget > 0 ? 'the higher score' : 'most connected nodes'} wins, then HQ health.
      </p>
      <h3>Your turn</h3>
      <ul>
        <li><b>Select a unit:</b> green tiles are moves (hover to see the path), red crosshairs are attacks. Moving uses its order; it may then attack, use its ability or brace.</li>
        <li><b>Deploy:</b> click a hand card, then a green tile. It costs emeralds, not an order. Gold tiles are forward, next to a connected node.</li>
        <li><b>HQ ability:</b> the button under your panel, one order. <b>End turn</b> glows when nothing useful is left.</li>
      </ul>
      <h3>Movement</h3>
      <ul>{ELEMENTS.map(el => <li key={el}><b>{ELEMENT_INFO[el].name}:</b> {gridMoveText(el)}</li>)}</ul>
      <p>Fast cards move 1 further (and have 1 less health), slow ones 1 less (1 more health). {gridTerrainText().map(t => `${t.name}: ${t.text}`).join(' ')}</p>
      <h3>Combat</h3>
      <ul>{gridCombatText().map(r => <li key={r.name}><b>{r.name}:</b> {r.text}</li>)}</ul>
      <p>{gridBraceText()}</p>
      {gridComebackText().length > 0 && (<>
        <h3>Comebacks</h3>
        <ul>{gridComebackText().map(r => <li key={r.name}><b>{r.name}:</b> {r.text}</li>)}</ul>
      </>)}
      <h3>Nodes and the HQ</h3>
      <ul>{gridHqText().map(r => <li key={r.name}><b>{r.name}:</b> {r.text}</li>)}</ul>
      <h3>Clock</h3>
      <p>Friendly games give you {GRID_TURN_SECONDS} seconds a turn; three missed turns in a row forfeit. Practice has no clock.</p>
    </div>
  );
}


export default function GridGuide() {
  const tankEls = ELEMENTS;
  const perks = GRID.perks ? (['city', 'ore', 'crops', 'fish', 'wood'] as const) : [];
  const sample = (r: GridNode['resource'], city = false) => nodeGivesText({ city, resource: r });
  const armourEx = 2 * GRID.armourPerNode;
  const hit = 4;
  return (
    <div className={`${s.guide} ${g.guideTokens}`}>
      <nav className={s.guideNav} aria-label="Warfront guide sections">
        {[['gf-goal', 'Goal'], ['gf-turn', 'A turn'], ['gf-move', 'Movement'], ['gf-nodes', 'Nodes & armour'], ['gf-combat', 'Combat'], ['gf-deploy', 'Deploys'], ['gf-keywords', 'Keywords & tanks']].map(([id, label]) => (
          <a key={id} href={`#${id}`} className={s.chip} style={{ textDecoration: 'none' }}>{label}</a>
        ))}
      </nav>

      <Section id="gf-goal" icon={<MapIcon size={22} />} title="Warfront (beta)" lead={<>Chess meets the Wynncraft war map. Turns alternate on a {LAYOUTS[7][0].rows.length}×{LAYOUTS[7][0].rows.length} board (a {LAYOUTS[5][0].rows.length}×{LAYOUTS[5][0].rows.length} board for quick practice). Each HQ sits in the middle of its back row. <b>Destroy the enemy HQ ({GRID.hqHp} health){GRID.scoreTarget > 0 ? <>, or hold enough territory to reach {GRID.scoreTarget} points first,</> : null} to win.</b> Nothing is hidden but hands and decks.</>}>
        <div className={g.guideRow}>
          <figure className={g.diaFig}>
            <Diagram b={layoutBoard(7, 0)} cell={24} label={LAYOUTS[7][0].name} />
            <figcaption className="readable-font">{LAYOUTS[7][0].name}: nodes (gold), the city in the centre, mountains and rivers.</figcaption>
          </figure>
          <div className={`${s.goalRow} readable-font`}>
            <div className={s.goalCard}><Castle size={24} /><div><b>Your HQ</b><p>{gridHqText().find(r => r.name === 'HQ fire')?.text ?? 'It defends itself.'}</p></div></div>
            {GRID.scoreTarget > 0 && <div className={s.goalCard}><Trophy size={24} /><div><b>Territory score</b><p>{gridScoreText().find(r => r.name === 'Territory score')?.text}</p></div></div>}
            <div className={s.goalCard}><Link2 size={24} /><div><b>Nodes</b><p>Real territories. Claim them and chain them to your HQ for {GRID.scoreTarget > 0 ? 'points, ' : ''}emeralds, forward deploys and HQ armour.</p></div></div>
            <div className={s.goalCard}><Gem size={24} /><div><b>Emeralds</b><p>Cards cost about {pct(GRID.costScale)} of their tide cost, rounded up: a 3-tide card costs {gridEmeraldCost(3)}. The bank holds {GRID.bankCap}.</p></div></div>
          </div>
        </div>
      </Section>

      <Section id="gf-turn" icon={<Sparkles size={22} />} title="A turn" lead="Upkeep, then your orders and deploys in any order, then end turn. Your opponent watches every step, and you watch theirs on a replay.">
        <Lines rows={gridTurnText()} />
      </Section>

      <Section id="gf-move" icon={<Footprints size={22} />} title="Movement" lead={<>Every element moves its own way. Shaded tiles are where a unit in the middle could go this order, worked out by the game itself. Fast cards reach 1 further and slow ones 1 less, paid in health ({GRID.speedHealth}); the footprint number on a unit is its range.</>}>
        <div className={g.moveGrid}>
          {ELEMENTS.map(el => (
            <figure key={el} className={g.moveFig} style={{ '--el': ELEMENT_INFO[el].color } as CSSProperties}>
              <MoveDiagram el={el} />
              <figcaption className="readable-font"><b>{ELEMENT_INFO[el].glyph} {ELEMENT_INFO[el].name}</b> {gridMoveText(el)}</figcaption>
            </figure>
          ))}
        </div>
        <Lines rows={gridTerrainText()} />
      </Section>

      <Section id="gf-nodes" icon={<Link2 size={22} />} title="Nodes, connection and armour" lead={<>A node is yours once you end a turn on it with no enemy next to it. It only pays while it is <b>connected</b>: a chain of your units and nodes, each above, below or beside the last, back to your HQ.</>}>
        <div className={g.guideRow}>
          <ConnectionDiagram cut={false} />
          <ConnectionDiagram cut />
        </div>
        <div className={`${s.tips} readable-font`}>
          <div className={s.tip}><Shield size={16} /><span><b>The snipe decision.</b> Every connected node gives the enemy HQ {GRID.armourPerNode} armour: with {armourEx / GRID.armourPerNode} connected, a {hit}-power hit does {Math.max(GRID.armourMin, hit - armourEx)}. Standing on one link first cuts a node off, and the same hit does {Math.max(GRID.armourMin, hit - armourEx + GRID.armourPerNode)}. Cut, or hit now?</span></div>
          <div className={s.tip}><Link2 size={16} /><span><b>Guard your links.</b> An enemy on one of your nodes breaks the chain there, even before it claims it{GRID.scoreTarget > 0 ? ', and a cut node scores nothing at your next upkeep' : ''}.</span></div>
          {GRID.scoreTarget > 0 && <div className={s.tip}><Trophy size={16} /><span><b>Race or raid.</b> Nodes score for whoever held them through the enemy&apos;s turn. Every unit you send at the enemy HQ is one fewer holding your chain.</span></div>}
          {GRID.objectiveEvery > 0 && <div className={s.tip}><Target size={16} /><span><b>The objective.</b> {gridScoreText().find(r => r.name === 'Objective')?.text}</span></div>}
          <div className={s.tip}><Coins size={16} /><span><b>What a node gives.</b> {sample(null)}. The city gives {sample(null, true).split(', ').slice(-1)[0]} more. Catch-up: +{GRID.catchUp} emerald a turn while you have fewer connected nodes.</span></div>
        </div>
        {perks.length > 0 && (
          <div className={`${s.kwGuide} readable-font`} style={{ marginTop: '1rem' }}>
            {perks.map(p => {
              const Icon = PERK_ICON[p];
              const text = p === 'city' ? `+${GRID.perk.city} emerald` : p === 'ore' ? `+${GRID.perk.ore} power to your unit standing on it`
                : p === 'crops' ? `heals your unit on it ${GRID.perk.crops}` : p === 'fish' ? `draw ${GRID.perk.fish} every ${GRID.fishEvery} turns`
                  : GRID.hqHealShare > 0 ? `repairs your HQ ${GRID.perk.wood}` : 'no perk: HQs cannot be healed';
              return (
                <div key={p} className={s.kwItem}>
                  <span className={s.kwIcon}><Icon size={18} /></span>
                  <div><b>{p === 'city' ? 'City' : p.charAt(0).toUpperCase() + p.slice(1)}</b><p>{text}</p></div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section id="gf-combat" icon={<Swords size={22} />} title="Combat" lead="Select a unit and hover a red target: the preview shows the damage, the flank bonus, the armour, whether it kills, and any strike-back.">
        <div className={g.guideRow}>
          <figure className={g.diaFig}>
            <FlankDiagram />
            <figcaption className="readable-font">Two allies next to the target: +{Math.min(GRID.flankCap, 2 * GRID.flank)} damage.</figcaption>
          </figure>
          <Lines rows={gridCombatText()} />
        </div>
      </Section>

      <Section id="gf-deploy" icon={<Crosshair size={22} />} title="Deploys" lead={gridTurnText().find(r => r.name === 'Deploy')?.text}>
        <div className={g.guideRow}>
          <figure className={g.diaFig}>
            <DeployDiagram />
            <figcaption className="readable-font">Green: your back row. Gold: next to a connected node. The raider (red) blocks the tiles next to it.</figcaption>
          </figure>
          <div className={`${s.tips} readable-font`}>
            <div className={s.tip}><Crosshair size={16} /><span><b>Forward deploys</b> put fresh units at the front, but only next to a node that is still connected.</span></div>
            <div className={s.tip}><Shield size={16} /><span><b>Contested ground.</b> You can never deploy next to an enemy, so a raider at your wall stops you plugging the gap for free.</span></div>
            <div className={s.tip}><Sparkles size={16} /><span><b>On-deploy effects</b> that need a target ask for one after you pick the tile.</span></div>
          </div>
        </div>
      </Section>

      <Section id="gf-keywords" icon={<Shield size={22} />} title="Keywords and tanks" lead="Keywords read differently on a grid. Your tank's element is your deck's most common one; its ability is one order, once a turn.">
        <div className={`${s.kwGuide} readable-font`}>
          {KEYWORDS.map(k => {
            const Icon = KEYWORD_ICON[k];
            const t = gridKeywordText(k);
            return (
              <div key={k} className={s.kwItem}>
                <span className={s.kwIcon}><Icon size={18} /></span>
                <div><b>{t.name}</b><p>{t.text}</p></div>
              </div>
            );
          })}
        </div>
        <div className={s.elements} style={{ marginTop: '1rem' }}>
          {tankEls.map(el => {
            const t = gridTankText({ tank: el });
            return (
              <div key={el} className={s.elementCard} style={{ '--el': ELEMENT_INFO[el].color } as CSSProperties}>
                <h3>{ELEMENT_INFO[el].glyph} {ELEMENT_INFO[el].name}</h3>
                <p className="readable-font"><b style={{ color: 'var(--text-primary)' }}>{t.name}</b> ({t.cost} emeralds). {t.text}</p>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
