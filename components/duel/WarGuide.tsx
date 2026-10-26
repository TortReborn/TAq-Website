'use client';

// The Three-Front War guide. Like Guide.tsx, all its prose lives here and
// every number comes from the war config (WAR) or the war text exports, so
// it tracks the rules as they are tuned.

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeftRight, Castle, Coins, Eye, Gauge, Gem, Layers, Shield, Sparkles, Swords, Target,
} from 'lucide-react';
import { ELEMENT_INFO } from '@/lib/duel/text';
import { ELEMENTS, type CardDef, type Keyword } from '@/lib/duel/types';
import {
  emeraldCost, LANES, moveOf, reachOf, TERRITORIES, WAR, warBraceText, warComebackText, warStanceText, warGuide, warHealth, warIncomeText, warKeywordText, warShiftText,
  warCards, warSpeed, warSwitchText, warTankText,
  type Lane, type Resource,
} from '@/lib/duel/war/client';
import CardFace, { CardRulesProvider, KEYWORD_ICON, SPEED_NAME, UnitTile } from './CardFace';
import { LANE_NAME, PERK_ICON, WAR_CARD_RULES, perkText } from './warShared';
import s from './duel.module.css';
import w from './war.module.css';

const KEYWORDS: Keyword[] = ['guard', 'rush', 'ranged', 'stealth', 'shield', 'drain', 'pierce', 'regen'];
const pct = (x: number) => `${Math.round(x * 100)}%`;

function useExamples() {
  return useMemo(() => {
    // War prices, as war games play them.
    const cards = warCards().filter(c => c.tier !== 'token' && c.image && !c.name.startsWith('?')).sort((a, b) => a.slug.localeCompare(b.slug));
    const bySpeed = (sp: number) => cards.find(c => warSpeed(c) === sp && !c.keywords.length && c.cost >= 2 && c.cost <= 4);
    const board = [
      cards.find(c => c.keywords.includes('guard') && c.cost <= 4),
      cards.find(c => c.keywords.includes('ranged')),
      cards.find(c => c.keywords.includes('rush') && c.cost <= 3),
    ];
    const foes = [
      cards.find(c => !c.keywords.length && c.cost === 3 && warSpeed(c) === 2),
      cards.find(c => c.keywords.includes('shield') && c.cost <= 4),
      cards.find(c => c.keywords.includes('stealth') && c.cost <= 4),
    ];
    const mover = cards.find(c => moveOf(c) && c.cost >= 3 && c.cost <= 5);
    const centre = TERRITORIES.find(t => t.city) ?? TERRITORIES[0];
    const flanks = TERRITORIES.filter(t => t !== centre && t.resource).slice(0, 2);
    return {
      speeds: [bySpeed(3), bySpeed(2), bySpeed(1)].filter(Boolean) as CardDef[],
      board: board as (CardDef | undefined)[],
      foes: foes as (CardDef | undefined)[],
      mover,
      territories: [flanks[0], centre, flanks[1]],
    };
  }, []);
}

const unit = (def: CardDef, patch: Partial<{ health: number }> = {}) => {
  const h = warHealth(def);
  return {
    uid: def.slug, slug: def.slug, power: def.power, health: patch.health ?? h, maxHealth: h, keywords: def.keywords,
    ready: true, shield: def.keywords.includes('shield'), stealth: def.keywords.includes('stealth'), frozenUntil: -1,
  };
};

function Section({ id, icon, title, lead, children }: { id: string; icon: ReactNode; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={s.guideSection}>
      <h2 className={s.row}>{icon} {title}</h2>
      {lead && <p className={`${s.guideLead} readable-font`}>{lead}</p>}
      {children}
    </section>
  );
}

/** The reach rules as lines from your three slots to theirs. */
function ReachDiagram() {
  const x = (l: number) => 60 + l * 120;
  const rows: { label: string; lanes: (l: Lane) => Lane[] }[] = [
    { label: 'Most units', lanes: l => reachOf(l, false) },
    { label: 'Ranged', lanes: l => reachOf(l, true) },
  ];
  return (
    <div className={w.reachWrap}>
      {rows.map(r => (
        <figure key={r.label} className={w.reachFig}>
          <svg viewBox="0 0 360 170" className={w.reachSvg} role="img" aria-label={`${r.label}: which enemy slots each lane can attack`}>
            {LANES.map(l => (
              <g key={`f${l}`}>
                <rect x={x(l) - 34} y={10} width={68} height={40} rx={8} className={w.reachFoe} />
                <text x={x(l)} y={35} textAnchor="middle" className={w.reachText}>{LANE_NAME[l]}</text>
                <rect x={x(l) - 34} y={120} width={68} height={40} rx={8} className={w.reachMine} />
                <text x={x(l)} y={145} textAnchor="middle" className={w.reachText}>{LANE_NAME[l]}</text>
              </g>
            ))}
            {LANES.flatMap(from => r.lanes(from).map(to => (
              <line key={`${from}${to}`} x1={x(from)} y1={118} x2={x(to)} y2={52} className={from === to ? w.reachLineStraight : w.reachLine} />
            )))}
          </svg>
          <figcaption className="readable-font">{r.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function MiniBoard({ ex }: { ex: ReturnType<typeof useExamples> }) {
  return (
    <div className={`${s.guideDark} ${w.miniBoard}`}>
      {LANES.map(lane => {
        const t = ex.territories[lane];
        const Perk = t?.city ? PERK_ICON.city : t?.resource ? PERK_ICON[t.resource] : Gem;
        const foe = ex.foes[lane];
        const mine = ex.board[lane];
        return (
          <div key={lane} className={`${w.miniLane} ${lane === 1 ? w.laneCentre : ''}`}>
            <div className={w.laneHead}><Perk size={13} /> <b>{t?.name ?? LANE_NAME[lane]}</b>{lane === 1 && <span className={w.centreTag}>Centre</span>}</div>
            <div className={`${w.tower} ${w.towerFoe}`}><Castle size={13} /><span className={w.towerPips}>{Array.from({ length: WAR.towerHp }, (_, i) => <span key={i} className={w.pipOn} />)}</span><b className={w.towerHp}>{WAR.towerHp}</b></div>
            <div className={w.miniSlot}>{foe && <UnitTile def={foe} unit={unit(foe)} frozen={false} />}</div>
            <div className={w.miniSlot}>{mine && <UnitTile def={mine} unit={unit(mine)} frozen={false} />}</div>
            <div className={`${w.tower} ${w.towerMine}`}><Castle size={13} /><span className={w.towerPips}>{Array.from({ length: WAR.towerHp }, (_, i) => <span key={i} className={w.pipOn} />)}</span><b className={w.towerHp}>{WAR.towerHp}</b></div>
          </div>
        );
      })}
    </div>
  );
}

/** The rules on one screen, for the in-war help overlay. */
export function QuickWarRules() {
  return (
    <div className={`${s.quickRules} readable-font`}>
      <p>
        Destroy <b>{WAR.towersToWin}</b> of the enemy&apos;s 3 towers ({WAR.towerHp} health each). Both sides plan a round in secret,
        lock in, then it plays out. At round {WAR.roundLimit} the war is called on towers destroyed, then tower damage dealt.
      </p>
      <h3>Planning</h3>
      <ul>
        <li><b>Orders:</b> click a unit: Attack a slot in reach, Move (its ability, paid in emeralds{WAR.moveAndAttack ? ', and it still attacks' : ''}), Brace ({warBraceText()}), Switch with a garrison unit{WAR.switchBrace ? ' (it comes in braced)' : ''}, or Shift to the next slot ({warShiftText()}).</li>
        <li><b>Deploy:</b> click a hand card, then an empty slot or the garrison. New units act from next round.</li>
        <li><b>HQ:</b> your tank&apos;s ability, once a round. <b>Lock in</b> when you are done; you can edit until then.</li>
      </ul>
      <h3>Resolution</h3>
      <p>1. Switches, then shifts. 2. Deploys. 3. Attacks, moves and HQ orders, fastest first (Rush before everything){WAR.shiftAttack && WAR.shiftAttackTiming === 'last' ? '; attacks made after a shift land last' : ''}. Attacks hit whoever stands in the slot <i>when they land</i>.</p>
      <h3>Reach and towers</h3>
      <p>
        A flank reaches the slot opposite and the centre; the centre reaches all three; Ranged reaches all. An attack on the empty slot
        straight opposite hits that lane&apos;s tower, and every hit on a lane&apos;s defender chips {warGuide().chip} off its tower.
      </p>
      <h3>Economy</h3>
      <p>{warIncomeText()} Hold a front (your unit there, none opposite) for its territory&apos;s perk.</p>
      {warComebackText().length > 0 && (<>
        <h3>Comebacks</h3>
        <ul>{warComebackText().map(r => <li key={r.name}><b>{r.name}:</b> {r.text}</li>)}</ul>
      </>)}
      <h3>Clock</h3>
      <p>Friendly wars give you {warGuide().roundSeconds} seconds to lock in a round. Miss it and your units brace; three misses in a row forfeit. Practice has no clock.</p>
    </div>
  );
}

export default function WarGuide() {
  const ex = useExamples();
  const perks: (Resource | 'city')[] = ['city', 'ore', 'crops', 'fish', 'wood'];
  const perkWords: Record<Resource | 'city', string> = {
    city: `+${WAR.perk.city} emerald income`, ore: `+${WAR.perk.ore} attack that round`, crops: `heals the holder ${WAR.perk.crops}`,
    fish: `draw ${WAR.perk.fish} card`, wood: `repairs that tower ${WAR.perk.wood}`,
  };
  return (
    <CardRulesProvider value={WAR_CARD_RULES}>
      <div className={s.guide}>
        <nav className={s.guideNav} aria-label="War guide sections">
          {[['war-goal', 'Goal'], ['war-round', 'A round'], ['war-orders', 'Orders'], ['war-reach', 'Reach'], ['war-speed', 'Speed'], ['war-towers', 'Towers & chip'], ['war-read', 'Reading the enemy'], ['war-economy', 'Emeralds & perks'], ['war-keywords', 'Keywords & tanks']].map(([id, label]) => (
            <a key={id} href={`#${id}`} className={s.chip} style={{ textDecoration: 'none' }}>{label}</a>
          ))}
        </nav>

        <Section id="war-goal" icon={<Castle size={22} />} title="Three-Front War (beta)" lead={<>Three lanes, each in front of a real Wynncraft territory. Each side has a tower in every lane with {WAR.towerHp} health. <b>Destroy {WAR.towersToWin} of the enemy&apos;s 3 towers to win.</b> If nobody has by round {WAR.roundLimit}, most towers destroyed wins, then most tower damage dealt.</>}>
          <MiniBoard ex={ex} />
          <div className={`${s.goalRow} readable-font`} style={{ marginTop: '1rem' }}>
            <div className={s.goalCard}><Layers size={24} /><div><b>3 slots and a garrison</b><p>One unit per lane, plus {WAR.garrison} in reserve. The garrison is public: both players can see it.</p></div></div>
            <div className={s.goalCard}><Eye size={24} /><div><b>Simultaneous rounds</b><p>No first player. Both sides plan in secret and lock in; then the round plays out for both at once.</p></div></div>
            <div className={s.goalCard}><Gem size={24} /><div><b>Emeralds</b><p>Cards cost about {pct(WAR.costScale)} of their tide cost in emeralds, rounded up. {warIncomeText()}</p></div></div>
          </div>
        </Section>

        <Section id="war-round" icon={<Sparkles size={22} />} title="A round" lead="Each round has an upkeep, a secret planning phase, and a resolution everyone watches.">
          <div className={`${s.steps} readable-font`}>
            {[
              ['Upkeep', `${warIncomeText()} Draw ${WAR.draw} from round 2, and every front you hold pays its perk. Regen heals.`],
              ['Plan', 'Give each unit an order, deploy cards from your hand, and optionally give your HQ an order. Your opponent does the same, unseen.'],
              ['Lock in', 'When you are happy, lock in. You can change anything until then. Units without an order stand idle.'],
              ['1. Switches and shifts', 'Units swap in from the garrison or slide to the next slot, before anything else happens.'],
              ['2. Deploys', 'New units arrive in their slots, and on-deploy effects fire. They act from next round.'],
              ['3. Actions by speed', `Attacks, moves and HQ orders go fastest first; Rush goes before everything.${WAR.shiftAttack && WAR.shiftAttackTiming === 'last' ? ' Attacks made after a shift land last.' : ''} Ties go to ${WAR.underdogInitiative ? 'the side behind on towers (Initiative), otherwise a coin flip' : 'a coin flip'}.`],
            ].map(([title, text], i) => (
              <div key={title} className={s.step}>
                <span className={s.stepNum}>{i + 1}</span>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="war-orders" icon={<Swords size={22} />} title="Orders" lead="Click one of your units to open its orders. The board shows every order you give: arrows for attacks and shifts, a badge on each unit.">
          <div className={`${s.kwGuide} readable-font`}>
            {[
              [Swords, 'Attack', 'Pick a slot in reach. The attack hits whoever is standing there when it lands, not who was there when you planned.'],
              [Sparkles, 'Move', `Use the unit's ability, paid in emeralds (about ${pct(WAR.moveCostScale)} of its tide cost).${WAR.moveAndAttack ? ' It can attack in the same action.' : ''}`],
              [Shield, 'Brace', `${warBraceText()} Good when you expect to be focused.`],
              [ArrowLeftRight, 'Switch', `${warSwitchText()} A fresh unit soaks the hits aimed at a hurt one.`],
              [ArrowLeftRight, 'Shift', `${warShiftText()} Retake an empty centre, or dodge.`],
            ].map(([Icon, name, text]) => {
              const I = Icon as typeof Swords;
              return (
                <div key={name as string} className={s.kwItem}>
                  <span className={s.kwIcon}><I size={18} /></span>
                  <div><b>{name as string}</b><p>{text as string}</p></div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="war-reach" icon={<Target size={22} />} title="Reach" lead="Which enemy slots a unit can attack depends on its lane. The centre is the strongest seat: it reaches every lane, and both flanks can reach it.">
          <ReachDiagram />
        </Section>

        <Section id="war-speed" icon={<Gauge size={22} />} title="Speed" lead={<>Every card has a speed: fast (3), normal (2) or slow (1). Fast units act first but pay {WAR.speedHealth} health for it; slow ones get {WAR.speedHealth} extra. <b>Rush</b> acts before any speed. Speed shows as the number in each unit&apos;s corner.</>}>
          <div className={s.rarityRow}>
            {ex.speeds.map(c => (
              <figure key={c.slug} className={w.speedFig}>
                <CardFace def={c} />
                <figcaption className="readable-font">{SPEED_NAME[warSpeed(c)]}: acts {warSpeed(c) === 3 ? 'first' : warSpeed(c) === 2 ? 'second' : 'last'}</figcaption>
              </figure>
            ))}
          </div>
          <p className={`${s.guideLead} readable-font`} style={{ margin: '0 auto', textAlign: 'center' }}>
            A fast unit can knock out an enemy before it swings, and a switch happens before any of them.
          </p>
        </Section>

        <Section id="war-towers" icon={<Castle size={22} />} title="Towers and chip" lead="Towers only fall to pressure in their own lane.">
          <div className={`${s.tips} readable-font`}>
            <div className={s.tip}><Castle size={16} /><span><b>Open lanes.</b> An attack on the empty slot straight opposite hits that lane&apos;s tower for the unit&apos;s full power. Empty slots elsewhere are a miss.</span></div>
            <div className={s.tip}><Swords size={16} /><span><b>Chip.</b> Every time a lane&apos;s defender takes attack damage, the tower behind it loses {warGuide().chip}. Fighting in a lane wears its tower down.</span></div>
            <div className={s.tip}><Shield size={16} /><span><b>Guard.</b> {warKeywordText('guard').text} Other lanes can still hit past it.</span></div>
            <div className={s.tip}><Target size={16} /><span><b>Pierce.</b> {warKeywordText('pierce').text}</span></div>
          </div>
        </Section>

        <Section id="war-read" icon={<Eye size={22} />} title="Reading the enemy" lead="Because attacks aim at slots and switches happen first, every round is a small guessing game.">
          <div className={`${s.tips} readable-font`}>
            <div className={s.tip}><ArrowLeftRight size={16} /><span><b>They are hurt? Expect a switch.</b> A heavy hit aimed at a dying unit lands on whatever swaps in. The log calls it out as <i>catching the unit that swapped in</i>.</span></div>
            <div className={s.tip}><Shield size={16} /><span><b>Brace against a focus.</b> If two enemy lanes can reach your centre, they probably will. {warBraceText()}</span></div>
            {WAR.braceStance !== 'off' && <div className={s.tip}><Shield size={16} /><span><b>Read the stance.</b> A shield badge on a unit means it is still braced this round: {warStanceText().replace(/^Braced: /, '')} Aim elsewhere, or make them move it.</span></div>}
            <div className={s.tip}><Castle size={16} /><span><b>An empty lane is an open door.</b> Leave a slot empty and the enemy unit opposite hits your tower directly. Deploy or shift to plug it.</span></div>
            <div className={s.tip}><Gauge size={16} /><span><b>Count speeds.</b> If your fast unit can finish theirs first, their attack never happens.</span></div>
          </div>
        </Section>

        <Section id="war-economy" icon={<Coins size={22} />} title="Emeralds and perks" lead={<>A card costs about {pct(WAR.costScale)} of its tide cost in emeralds, rounded up: a {3}-tide card costs {emeraldCost(3)}. Hold a front (your unit in its slot, none opposite) at upkeep to collect its territory&apos;s perk.</>}>
          <div className={`${s.kwGuide} readable-font`}>
            {perks.map(p => {
              const Icon = PERK_ICON[p];
              return (
                <div key={p} className={s.kwItem}>
                  <span className={s.kwIcon}><Icon size={18} /></span>
                  <div><b>{p === 'city' ? 'City' : p.charAt(0).toUpperCase() + p.slice(1)}</b><p>{perkWords[p]}</p></div>
                </div>
              );
            })}
          </div>
          {ex.territories[1] && <p className={`${s.guideLead} readable-font`} style={{ marginTop: '1rem' }}>The centre is a city when the draw has one: {ex.territories[1].name} would pay {perkText(ex.territories[1])}.</p>}
        </Section>

        <Section id="war-keywords" icon={<Shield size={22} />} title="Keywords and tanks in war" lead="Some keywords read differently on a lane board. Your tank's element is your deck's most common one, and its HQ order is usable once a round.">
          <div className={`${s.kwGuide} readable-font`}>
            {KEYWORDS.map(k => {
              const Icon = KEYWORD_ICON[k];
              const t = warKeywordText(k);
              return (
                <div key={k} className={s.kwItem}>
                  <span className={s.kwIcon}><Icon size={18} /></span>
                  <div><b>{t.name}</b><p>{t.text}</p></div>
                </div>
              );
            })}
          </div>
          <div className={s.elements} style={{ marginTop: '1rem' }}>
            {ELEMENTS.map(el => {
              const t = warTankText({ tank: el });
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
    </CardRulesProvider>
  );
}
