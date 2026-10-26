'use client';

// The Tank Duels guide. All rules prose lives in this file so it is easy to
// revise as the rules move; every number comes from the engine's exports.

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown, BookOpen, Crown, Hand, Heart, Layers, Lightbulb, RefreshCw, Shield, Sparkles, Swords, Target, Waves,
} from 'lucide-react';
import { allCards } from '@/lib/duel/catalog';
import { MAX_COPIES, MAX_MYTHIC, MAX_RENOWNED, RENOWNED } from '@/lib/duel/deck';
import {
  BOARD_SLOTS, DECK_SIZE, HERO_HP, MAX_HAND, MAX_TIDE, moveOf, START_HAND, tankOf,
} from '@/lib/duel/engine';
import { abilityText, ELEMENT_INFO, KEYWORD_TEXT } from '@/lib/duel/text';
import { ELEMENTS, type CardDef, type Element, type Keyword } from '@/lib/duel/types';
import CardFace, { KEYWORD_ICON, UnitTile, unitOf } from './CardFace';
import s from './duel.module.css';

const KEYWORDS = Object.keys(KEYWORD_TEXT) as Keyword[];

/** Stable example cards, picked from the live catalog so they track balance changes. */
function useExamples() {
  return useMemo(() => {
    // Skip mystery NPCs ("??? (Quest)"): a teaching example should have a real name.
    const cards = allCards().filter(c => c.tier !== 'token' && c.image && !c.name.startsWith('?')).sort((a, b) => a.slug.localeCompare(b.slug));
    const pick = (f: (c: CardDef) => boolean) => cards.find(f);
    const anatomy = pick(c => c.keywords.length > 0 && !!moveOf(c) && c.cost >= 3 && c.cost <= 5)
      ?? pick(c => c.keywords.length > 0 && c.abilities.length > 0)
      ?? cards[0];
    const byElement = Object.fromEntries(ELEMENTS.map(el => [
      el,
      pick(c => c.element === el && c.tier !== 'normal' && c.abilities.length > 0 && c.cost >= 2 && c.cost <= 5)
        ?? pick(c => c.element === el),
    ])) as Record<Element, CardDef | undefined>;
    const plain = cards.filter(c => !c.keywords.length && !c.abilities.length && c.power > 0);
    const attacker = plain.find(c => c.power >= 3 && c.health >= 3);
    const defender = plain.find(c => attacker && c.slug !== attacker.slug && c.power >= 1 && c.health <= attacker.power && c.power < attacker.health);
    const guard = pick(c => c.keywords.includes('guard'));
    // Same cost, three rarities: the budget is the same, only its shape changes.
    let rarity: CardDef[] = [];
    for (const cost of [3, 4, 2, 5]) {
      const row = ['normal', 'rare', 'legendary'].map(t => pick(c => c.cost === cost && c.tier === t)).filter(Boolean) as CardDef[];
      if (row.length === 3) { rarity = row; break; }
    }
    return { anatomy, byElement, attacker, defender, guard, rarity };
  }, []);
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

const PINS: { at: [number, number]; title: string; text: string }[] = [
  { at: [8, 6], title: 'Tide cost', text: 'What it costs to play. You spend tide from the crystals beside your portrait.' },
  { at: [92, 6], title: 'Element', text: 'Earth, Thunder, Water, Fire or Air. It sets the card\'s style, and your deck\'s main element picks your tank.' },
  { at: [50, 36], title: 'Name and rarity', text: 'The border colour is the rarity, the same colours as the Discord bot.' },
  { at: [50, 53], title: 'Keywords', text: 'Always-on abilities like Guard or Rush. Hover one in a game to read it.' },
  { at: [50, 70], title: 'Abilities', text: 'On play, when it dies, each turn, or a move: an action a unit can take instead of attacking, for tide.' },
  { at: [3, 97], title: 'Power', text: 'The damage it deals when it attacks, or hits back when attacked.' },
  { at: [97, 97], title: 'Health', text: 'Damage it can take. Damage stays, so a hurt unit remains hurt. At 0 it is defeated.' },
];

function Anatomy({ def }: { def: CardDef }) {
  return (
    <div className={s.anatomy}>
      <div className={s.anatomyCard}>
        <CardFace def={def} large />
        {PINS.map((p, i) => (
          <span key={i} className={s.pin} style={{ left: `${p.at[0]}%`, top: `${p.at[1]}%` }}>{i + 1}</span>
        ))}
      </div>
      <div className={`${s.callouts} readable-font`}>
        {PINS.map((p, i) => (
          <div key={i} className={s.callout}>
            <span className={s.pin}>{i + 1}</span>
            <div><b>{p.title}</b><p>{p.text}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Combat({ attacker, defender, guard }: { attacker?: CardDef; defender?: CardDef; guard?: CardDef }) {
  if (!attacker || !defender) return null;
  const aAfter = attacker.health - defender.power;
  const dAfter = defender.health - attacker.power;
  return (
    <div className={s.demo}>
      <div className={s.guideDark}>
        <div className={s.demoTitle}>Both sides hit at once</div>
        <div className={s.demoBoard}>
          <UnitTile def={defender} unit={unitOf(defender)} frozen={false} target="enemy" />
          <div className={s.demoArrow}><Swords size={22} /> attacks</div>
          <UnitTile def={attacker} unit={unitOf(attacker)} frozen={false} selected />
        </div>
        <div className={s.demoBoard} style={{ paddingTop: 0 }}>
          <ArrowDown size={20} color="var(--d-tide)" />
        </div>
        <div className={s.demoBoard}>
          <div style={{ opacity: dAfter <= 0 ? 0.35 : 1, filter: dAfter <= 0 ? 'grayscale(1)' : undefined }}>
            <UnitTile def={defender} unit={unitOf(defender, { health: Math.max(0, dAfter) })} frozen={false} />
          </div>
          <div className={s.demoArrow} style={{ color: 'var(--d-ink-2)' }}>after</div>
          <UnitTile def={attacker} unit={unitOf(attacker, { health: aAfter, ready: false })} frozen={false} />
        </div>
        <p className={`${s.demoCaption} readable-font`}>
          {attacker.name} ({attacker.power} power) deals {attacker.power} to {defender.name}, and takes {defender.power} back.
          {dAfter <= 0 ? ` ${defender.name} is defeated; ${attacker.name} survives on ${aAfter}.` : ''}
        </p>
      </div>
      {guard && (
        <div className={s.guideDark}>
          <div className={s.demoTitle}>Guard comes first</div>
          <div className={s.demoBoard}>
            <div className={s.demoHero} title="Enemy tank"><Crown size={26} /></div>
            <UnitTile def={guard} unit={unitOf(guard)} frozen={false} target="enemy" />
          </div>
          <p className={`${s.demoCaption} readable-font`}>
            While an enemy has a unit with <b style={{ color: 'var(--d-ink)' }}>Guard</b>, your attackers must hit a Guard first:
            the tank and every other unit are out of reach. Break the wall, or go around it with effects that
            deal damage directly.
          </p>
        </div>
      )}
    </div>
  );
}

const TURN_STEPS = (): { icon: ReactNode; title: string; text: string }[] => [
  { icon: <Waves size={20} />, title: 'Tide rises', text: `You gain one more tide crystal each turn, up to ${MAX_TIDE}, and all of them refill. Tide is your mana.` },
  { icon: <Layers size={20} />, title: 'Draw a card', text: `One card from your deck. You can hold ${MAX_HAND}; draw past that and the card burns.` },
  { icon: <Hand size={20} />, title: 'Play cards', text: `Click a glowing card, then your side of the board. Up to ${BOARD_SLOTS} units on your side.` },
  { icon: <Swords size={20} />, title: 'Attack or use moves', text: 'Each ready unit acts once: attack an enemy unit or tank, or use its move. New units wait a turn unless they have Rush.' },
  { icon: <Sparkles size={20} />, title: 'Use your tank', text: 'Your tank has an ability of its own, once a turn, for tide. Handy when your hand is empty or your tide would go to waste.' },
  { icon: <RefreshCw size={20} />, title: 'End turn', text: 'The button glows when you have nothing left to do. Unspent tide does not carry over.' },
];

/** The rules on one screen, for the in-battle help overlay. */
export function QuickRules() {
  return (
    <div className={`${s.quickRules} readable-font`}>
      <p>
        Bring the enemy tank from <b>{HERO_HP}</b> health to 0. Each turn you get more <b>tide</b> (up to {MAX_TIDE}) to play
        units from your hand. Units act once a turn from the turn after they arrive: attack, or use their move.
      </p>
      <h3>Controls</h3>
      <ul>
        <li><b>Play a card:</b> click it in your hand, then click your side of the board (or a glowing target, if it has one).</li>
        <li><b>Attack:</b> click a unit glowing green, then a red-outlined enemy unit or tank.</li>
        <li><b>Move:</b> select your unit, then press its move button in the middle strip.</li>
        <li><b>Tank ability:</b> the round button next to your portrait, once a turn.</li>
        <li><b>Cancel:</b> click the selected card again, or press Esc.</li>
      </ul>
      <h3>Combat</h3>
      <p>Both units deal their power to each other at once. Damage stays. Guard units must be attacked before anything else.</p>
      <h3>Going second</h3>
      <p>
        The first player starts with {START_HAND[0]} cards and skips their first draw; the second starts with {START_HAND[1]}
        {' '}and the <b>Pearl</b>: +1 tide once, whenever they like.
      </p>
      <h3>Keywords</h3>
      <div className={s.quickKw}>
        {KEYWORDS.map(k => {
          const Icon = KEYWORD_ICON[k];
          return <div key={k}>{Icon && <Icon size={15} />}<span><b>{KEYWORD_TEXT[k].name}.</b> {KEYWORD_TEXT[k].text}</span></div>;
        })}
      </div>
    </div>
  );
}

const TIPS: { title: string; text: string }[] = [
  { title: 'Spend your tide.', text: 'Tide you do not use is lost. A 2-cost and a 3-cost card on turn five beat one 4-cost card and a crystal left over.' },
  { title: 'Trade, then go face.', text: 'Attacking a unit that would hit you next turn is usually worth more than 2 damage to the tank. Race only when you are ahead on board.' },
  { title: 'Read before you click.', text: 'Hover any unit, even the enemy\'s, to see its card in the side panel.' },
  { title: 'Respect Guard.', text: 'A cheap Guard can buy you a whole turn. Play one when you are behind; kill theirs first when you are ahead.' },
  { title: 'Keep a curve.', text: `Around a third of a ${DECK_SIZE}-card deck should cost 1 or 2, or your early turns will be empty.` },
  { title: 'Practice is free.', text: 'The practice bot lets you try any card, owned or not, with no clock. Test a deck there before a friendly duel.' },
];

export default function Guide() {
  const ex = useExamples();
  const nav: [string, string][] = [
    ['goal', 'Goal'], ['card', 'Reading a card'], ['turn', 'A turn'], ['combat', 'Combat & Guard'],
    ['keywords', 'Keywords'], ['elements', 'Elements & tanks'], ['decks', 'Decks & rarity'], ['tips', 'Tips'],
  ];
  return (
    <div className={s.guide}>
      <nav className={s.guideNav} aria-label="Guide sections">
        {nav.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={s.chip} style={{ textDecoration: 'none' }}>{label}</a>
        ))}
      </nav>

      <Section id="goal" icon={<Target size={22} />} title="The goal" lead={<>Tank Duels is a one-on-one card battle built from the cards you reel in the Discord bot. Each player fights from a <b>tank</b> with {HERO_HP} health. Knock the other tank down to zero to win.</>}>
        <div className={s.guideDark}>
          <div className={`${s.goalRow} readable-font`}>
            <div className={s.goalCard}><Heart size={26} /><div><b>{HERO_HP} health each</b><p>Your tank is your life total. Units can attack it, and some abilities hit it directly.</p></div></div>
            <div className={s.goalCard}><Layers size={26} /><div><b>{DECK_SIZE}-card decks</b><p>Build your own from the cards you own, or start with a free starter deck.</p></div></div>
            <div className={s.goalCard}><Waves size={26} /><div><b>Tide to {MAX_TIDE}</b><p>Your tide grows each turn, so bigger cards come later. Cheap cards win the early turns.</p></div></div>
            <div className={s.goalCard}><Swords size={26} /><div><b>{BOARD_SLOTS} units a side</b><p>Units stay on the board and fight each turn until they are defeated.</p></div></div>
          </div>
        </div>
      </Section>

      {ex.anatomy && (
        <Section id="card" icon={<BookOpen size={22} />} title="Reading a card" lead="Every card is a unit. Here is what each part means.">
          <Anatomy def={ex.anatomy} />
        </Section>
      )}

      <Section id="turn" icon={<RefreshCw size={22} />} title="A turn, step by step" lead={<>Players take turns. You begin by choosing an opening hand: click cards to swap them once. The first player starts with {START_HAND[0]} cards and skips their first draw; the second starts with {START_HAND[1]} and holds the <b>Pearl</b>, +1 tide once.</>}>
        <div className={`${s.steps} readable-font`}>
          {TURN_STEPS().map((st, i) => (
            <div key={i} className={s.step}>
              <div className={s.row} style={{ justifyContent: 'space-between' }}>
                <span className={s.stepNum}>{i + 1}</span>
                <span style={{ color: 'var(--text-muted)' }}>{st.icon}</span>
              </div>
              <b>{st.title}</b>
              <p>{st.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="combat" icon={<Swords size={22} />} title="Combat and Guard" lead="When a unit attacks another unit, both deal their power to each other at the same time. Attacking the enemy tank is free: tanks do not hit back.">
        <Combat attacker={ex.attacker} defender={ex.defender} guard={ex.guard} />
      </Section>

      <Section id="keywords" icon={<Shield size={22} />} title="Keywords" lead="Keywords show as gold icons on units and as tags on cards.">
        <div className={`${s.kwGuide} readable-font`}>
          {KEYWORDS.map(k => {
            const Icon = KEYWORD_ICON[k];
            return (
              <div key={k} className={s.kwItem}>
                <span className={s.kwIcon}>{Icon && <Icon size={18} />}</span>
                <div><b>{KEYWORD_TEXT[k].name}</b><p>{KEYWORD_TEXT[k].text}</p></div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section id="elements" icon={<Sparkles size={22} />} title="Elements and tanks" lead="Elements are playstyles, not a rock-paper-scissors wheel: no element deals bonus damage to another. Your deck's most common element decides your tank, and each tank has its own ability, usable once a turn.">
        <div className={s.elements}>
          {ELEMENTS.map(el => {
            const info = ELEMENT_INFO[el];
            const def = ex.byElement[el];
            const tank = tankOf({ tank: el });
            return (
              <div key={el} className={s.elementCard} style={{ '--el': info.color } as CSSProperties}>
                <h3>{info.glyph} {info.name}</h3>
                <p className="readable-font">{info.style}</p>
                {def && <CardFace def={def} />}
                {tank && (
                  <p className="readable-font">
                    <b style={{ color: 'var(--text-primary)' }}>Tank: {tank.name}</b> ({tank.cost ?? 0} tide). {abilityText(tank).text}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section id="decks" icon={<Crown size={22} />} title="Decks, and why rarity is not power" lead={<>Every card is built to the same budget for its cost, whatever its rarity. Rarer cards spend that budget on abilities rather than bigger numbers, so a new member&apos;s deck of normal cards can beat a collector&apos;s.</>}>
        <div className={`${s.ruleGrid} readable-font`}>
          <div className={s.ruleTile}><b>{DECK_SIZE}</b><span>cards, exactly</span></div>
          <div className={s.ruleTile}><b>{MAX_COPIES}</b><span>copies of a normal, unique or rare card</span></div>
          <div className={s.ruleTile}><b>{MAX_RENOWNED}</b><span>renowned cards at most (legendary and up), one copy each</span></div>
          <div className={s.ruleTile}><b>{MAX_MYTHIC}</b><span>mythic card at most</span></div>
        </div>
        {ex.rarity.length === 3 && (
          <>
            <div className={s.rarityRow}>
              {ex.rarity.map(c => <CardFace key={c.slug} def={c} />)}
            </div>
            <p className={`${s.guideLead} readable-font`} style={{ textAlign: 'center', margin: '0 auto 1rem' }}>
              Three {ex.rarity[0].cost}-cost cards. The {ex.rarity[2].tier} one is not bigger; it trades stats for
              {ex.rarity[2].abilities.length ? ' an ability' : ' keywords'}{RENOWNED.has(ex.rarity[2].tier) ? ', and counts toward the renowned limit' : ''}.
            </p>
          </>
        )}
        <div className={`${s.prose} readable-font`}>
          <p>
            <b>Normal cards are free to everyone.</b> For friendly duels, anything rarer must be in your /reel collection.
            Practice games against the bot let you try any card, so you can test a deck before you chase its cards.
          </p>
          <p>Fused stars show on your card in the bot; in duels every copy plays the same.</p>
        </div>
      </Section>

      <Section id="tips" icon={<Lightbulb size={22} />} title="Tips for new players">
        <div className={`${s.tips} readable-font`}>
          {TIPS.map(t => (
            <div key={t.title} className={s.tip}><Lightbulb size={16} /><span><b>{t.title}</b> {t.text}</span></div>
          ))}
        </div>
      </Section>
    </div>
  );
}
