'use client';

import { createContext, useContext, type CSSProperties, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import {
  ArrowRightToLine, Castle, Crosshair, Droplet, EyeOff, Footprints, Gauge, HeartPulse, Shield, Snowflake, Zap, type LucideIcon,
} from 'lucide-react';
import { RENOWNED } from '@/lib/duel/deck';
import { abilityText, ELEMENT_INFO, KEYWORD_TEXT, TIER_INFO } from '@/lib/duel/text';
import type { Ability, CardDef, Keyword, Unit } from '@/lib/duel/types';
import s from './duel.module.css';

export const KEYWORD_ICON: Record<Keyword, LucideIcon> = {
  guard: Castle,
  rush: Zap,
  ranged: Crosshair,
  stealth: EyeOff,
  shield: Shield,
  drain: Droplet,
  pierce: ArrowRightToLine,
  regen: HeartPulse,
};

/**
 * How a ruleset reads a card. The duel shows the catalog numbers; Three-Front
 * War prices cards in emeralds, scales health, gives each card a speed and
 * words some keywords differently. A war board provides these through
 * CardRulesProvider so every card and unit inside it agrees.
 */
export interface CardRules {
  cost: (def: CardDef) => number;
  costLabel: string;
  costEmerald?: boolean;
  power: (def: CardDef) => number;
  health: (def: CardDef) => number;
  speed?: (def: CardDef) => number;
  /** Replaces the speed tag with a ruleset's own (Warfront: movement range). */
  speedTag?: (def: CardDef) => { text: string; title: string };
  keywordText: (kw: Keyword) => { name: string; text: string } | undefined;
  /** When an ability triggers, as the card says it ("On play", "Move (2 tide)"). */
  abilityLabel?: (a: Ability) => string;
}

const DUEL_RULES: CardRules = {
  cost: d => d.cost,
  costLabel: 'Tide cost',
  power: d => d.power,
  health: d => d.health,
  keywordText: kw => KEYWORD_TEXT[kw],
};

const CardRulesContext = createContext<CardRules>(DUEL_RULES);
export const CardRulesProvider = CardRulesContext.Provider;
export const useCardRules = () => useContext(CardRulesContext);

/** Speed words for the war's three tiers. */
export const SPEED_NAME: Record<number, string> = { 1: 'Slow', 2: 'Normal', 3: 'Fast' };

/** Unknown keywords (the rules are still moving) fall back to a plain dot. */
function kwIcon(kw: Keyword): LucideIcon | null {
  return KEYWORD_ICON[kw] ?? null;
}

function kwName(kw: Keyword): string {
  return KEYWORD_TEXT[kw]?.name ?? kw;
}

export function cardVars(def: CardDef, width?: number): CSSProperties {
  return {
    '--tier': TIER_INFO[def.tier]?.color ?? '#d9d9d9',
    '--el': ELEMENT_INFO[def.element].color,
    ...(width ? { '--card-w': `${width}px` } : {}),
  } as CSSProperties;
}

/** Share of the image height hidden at the top: the wiki's NPC name tag. */
const TAG_CUT = 0.19;

/**
 * Wiki art is an in-game shot of any shape (most square, about a fifth tall,
 * a few wide) with the NPC's name tag across the top and the head just below
 * it. Whatever the image and frame shapes, trim exactly TAG_CUT of the image
 * height from the top, so the face sits at the top of the frame: by moving
 * the image when it overflows the frame enough, else by enlarging it.
 */
function fitArt(e: SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const box = img.parentElement;
  if (!box || !box.clientHeight || !img.naturalHeight) return;
  const a = box.clientWidth / box.clientHeight;
  const r = img.naturalWidth / img.naturalHeight;
  if (r <= a * (1 - TAG_CUT)) {
    img.style.height = '100%';
    img.style.objectPosition = `50% ${Math.min(100, ((TAG_CUT * a) / (a - r)) * 100).toFixed(1)}%`;
  } else {
    img.style.height = `${(100 / (1 - TAG_CUT)).toFixed(1)}%`;
    img.style.objectPosition = '50% 0';
  }
}

export function Art({ def, className }: { def: CardDef; className?: string }) {
  return (
    <div className={`${s.art} ${className ?? ''}`}>
      {def.image ? (
        // Wiki art is hotlinked like the bot does; no-referrer keeps our
        // pages out of the wiki's logs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={def.image} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onLoad={fitArt} />
      ) : (
        <span className={s.artGlyph}>{ELEMENT_INFO[def.element].glyph}</span>
      )}
    </div>
  );
}

export function KeywordPill({ kw }: { kw: Keyword }) {
  const Icon = kwIcon(kw);
  const rules = useCardRules();
  return (
    <span className={s.kwPill} title={rules.keywordText(kw)?.text}>
      {Icon && <Icon size="1.05em" aria-hidden />} {kwName(kw)}
    </span>
  );
}

export function RulesText({ def }: { def: CardDef }) {
  const rules = useCardRules();
  return (
    <>
      {def.abilities.map((a, i) => {
        const t = abilityText(a);
        const label = rules.abilityLabel?.(a) ?? t.label;
        return (
          <p key={i} className={s.ability}>
            <b>{a.name ?? label}</b>
            {a.name && <span className={s.abilityWhen}> · {label}</span>}
            {' '}{t.text}
          </p>
        );
      })}
      {/* A keyword-only card explains its keywords rather than leaving the box empty. */}
      {!def.abilities.length && def.keywords.map(k => (
        <p key={k} className={s.ability}><b>{rules.keywordText(k)?.name ?? k}.</b> {rules.keywordText(k)?.text}</p>
      ))}
      {!def.abilities.length && !def.keywords.length && <p className={s.flavour}>A steady body. No tricks.</p>}
    </>
  );
}

interface CardFaceProps {
  def: CardDef;
  width?: number;
  large?: boolean;
  selected?: boolean;
  dim?: boolean;
  playable?: boolean;
  className?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  onHover?: () => void;
  title?: string;
  badge?: ReactNode;
}

export default function CardFace({ def, width, large, selected, dim, playable, className, onClick, onHover, title, badge }: CardFaceProps) {
  const cls = [
    s.card,
    large ? s.cardLarge : '',
    RENOWNED.has(def.tier) ? s.cardRenowned : '',
    onClick ? s.cardClickable : '',
    selected ? s.cardSelected : '',
    dim ? s.cardDim : '',
    playable ? s.cardPlayable : '',
    className ?? '',
  ].join(' ');
  const el = ELEMENT_INFO[def.element];
  const rules = useCardRules();
  const cost = rules.cost(def);
  const power = rules.power(def);
  const health = rules.health(def);
  const speed = rules.speed?.(def);
  const speedTag = rules.speedTag?.(def);
  return (
    <button
      type="button"
      className={cls}
      style={cardVars(def, width)}
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      disabled={!onClick}
      title={title}
      aria-label={`${def.name}, cost ${cost}, ${power} power, ${health} health${speed ? `, ${SPEED_NAME[speed] ?? speed} speed` : ''}`}
    >
      <div className={s.cardArtWrap}>
        <Art def={def} />
        <span className={`${s.cost} ${rules.costEmerald ? s.costEmerald : ''}`} title={rules.costLabel}>{cost}</span>
        {speedTag && <span className={s.speedTag} title={speedTag.title}><Footprints size="1em" aria-hidden />{speedTag.text}</span>}
        {!speedTag && speed !== undefined && <span className={s.speedTag} title={`${SPEED_NAME[speed] ?? speed} speed`}><Gauge size="1em" aria-hidden />{speed}</span>}
        <span className={s.elementBadge} title={el.name}>{el.glyph}</span>
        {badge}
      </div>
      <div className={s.nameBanner}><span>{def.name}</span></div>
      <div className={`${s.cardBody} readable-font`}>
        <div className={s.tierLine}>{TIER_INFO[def.tier]?.name ?? def.tier} · {el.name}{large && def.origin ? ` · ${def.origin}` : ''}</div>
        {def.keywords.length > 0 && (
          <div className={s.kwRow}>{def.keywords.map(k => <KeywordPill key={k} kw={k} />)}</div>
        )}
        <div className={s.rules}><RulesText def={def} /></div>
      </div>
      <span className={`${s.statGem} ${s.powerGem}`} aria-hidden>{power}</span>
      <span className={`${s.statGem} ${s.healthGem}`} aria-hidden>{health}</span>
    </button>
  );
}

/** A card back, for the opponent's hand and decks. */
export function CardBack({ small, className, style }: { small?: boolean; className?: string; style?: CSSProperties }) {
  return <span className={`${s.cardBack} ${small ? s.cardBackSmall : ''} ${className ?? ''}`} style={style} aria-hidden />;
}

/** A fresh unit for a card, for illustrations outside a match. */
export function unitOf(def: CardDef, patch: Partial<Unit> = {}): Unit {
  return {
    uid: def.slug, slug: def.slug, power: def.power, health: def.health, maxHealth: def.health,
    keywords: [...def.keywords], ready: true, shield: def.keywords.includes('shield'),
    stealth: def.keywords.includes('stealth'), frozenUntil: -1, ...patch,
  };
}

interface UnitTileProps {
  def: CardDef;
  unit: Unit;
  frozen: boolean;
  ready?: boolean;
  selected?: boolean;
  target?: 'enemy' | 'ally';
  /** Extra classes: animation states from the battle's effect timeline. */
  className?: string;
  /** Anchor for effects (lunges, floating numbers) to find this tile. */
  fxKey?: string;
  /** A unit that has already left the board, shown while its exit plays. */
  ghost?: boolean;
  floats?: ReactNode;
  /** Badges drawn over the tile (a war unit's order, its speed). */
  overlay?: ReactNode;
  onClick?: () => void;
  onHover?: () => void;
  onLeave?: () => void;
}

export function UnitTile({ def, unit, frozen, ready, selected, target, className, fxKey, ghost, floats, overlay, onClick, onHover, onLeave }: UnitTileProps) {
  const rules = useCardRules();
  const basePower = rules.power(def);
  const baseHealth = rules.health(def);
  const cls = [
    s.unit,
    RENOWNED.has(def.tier) ? s.unitRenowned : '',
    unit.keywords.includes('guard') ? s.unitGuard : '',
    unit.shield ? s.unitShielded : '',
    unit.stealth ? s.unitStealth : '',
    frozen ? s.unitFrozen : '',
    ready ? s.unitReady : '',
    selected ? s.unitSelected : '',
    target === 'enemy' ? s.unitTarget : target === 'ally' ? s.unitAllyTarget : '',
    ghost ? s.unitGhost : '',
    className ?? '',
  ].join(' ');
  const status: string[] = [];
  if (frozen) status.push('frozen');
  if (unit.shield) status.push('shielded');
  if (unit.stealth) status.push('in stealth');
  if (ready) status.push('ready');
  if (target) status.push('valid target');
  return (
    <button
      type="button"
      className={cls}
      style={cardVars(def)}
      data-fx={fxKey}
      // The lane under a unit is itself clickable (drop a card there).
      onClick={e => { e.stopPropagation(); onClick?.(); }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      tabIndex={ghost ? -1 : undefined}
      aria-hidden={ghost || undefined}
      aria-label={`${def.name}, ${unit.power} power, ${unit.health} of ${unit.maxHealth} health${unit.keywords.length ? ', ' + unit.keywords.map(kwName).join(', ') : ''}${status.length ? ', ' + status.join(', ') : ''}`}
    >
      {unit.keywords.includes('guard') && <span className={s.guardPlate} aria-hidden />}
      <div className={s.unitFrame}>
        <Art def={def} className={s.unitArt} />
        {frozen && <span className={s.frostVeil} aria-hidden />}
        <div className={s.unitName}><span>{def.name}</span></div>
      </div>
      {unit.keywords.length > 0 && (
        <div className={s.unitKws}>
          {unit.keywords.map(k => {
            const Icon = kwIcon(k);
            return (
              <span key={k} className={`${s.unitKw} ${k === 'guard' ? s.unitKwGuard : ''}`} title={`${kwName(k)}: ${rules.keywordText(k)?.text ?? ''}`}>
                {Icon ? <Icon size="1em" aria-hidden /> : kwName(k).charAt(0)}
              </span>
            );
          })}
        </div>
      )}
      {frozen && <span className={s.frostBadge} title="Frozen: skips its next turn"><Snowflake size="1em" aria-hidden /></span>}
      <span className={`${s.statGem} ${s.powerGem} ${unit.power > basePower ? s.gemUp : unit.power < basePower ? s.gemDown : ''}`}>{unit.power}</span>
      <span className={`${s.statGem} ${s.healthGem} ${unit.health < unit.maxHealth ? s.gemDown : unit.maxHealth > baseHealth ? s.gemUp : ''}`}>{unit.health}</span>
      {overlay}
      {floats}
    </button>
  );
}
