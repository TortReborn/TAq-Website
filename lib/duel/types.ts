// Shared types for Tank Duels, the card battle game built on the bot's card
// collection. Everything here is plain data so a game state round-trips
// through JSON (it lives in duel_matches.state) without loss.

export type Element = 'earth' | 'thunder' | 'water' | 'fire' | 'air';
export const ELEMENTS: Element[] = ['earth', 'thunder', 'water', 'fire', 'air'];

export type Tier = 'normal' | 'unique' | 'rare' | 'legendary' | 'fabled' | 'mythic' | 'member' | 'token';

export type Keyword =
  | 'guard'    // enemies must attack a Guard unit first
  | 'rush'     // can act the turn it is played
  | 'ranged'   // takes no retaliation damage when it attacks
  | 'stealth'  // cannot be chosen by the enemy until it acts
  | 'shield'   // prevents the first damage it would take
  | 'drain'    // attack damage it deals heals your hero
  | 'pierce'   // attack damage beyond a unit's health hits the enemy hero
  | 'regen';   // restores 2 health at the start of your turn

/** A target the player picks. `enemy`/`ally` include the hero. */
export type TargetSpec = 'enemy' | 'enemy_unit' | 'ally' | 'ally_unit' | 'any_unit';

/** Who an effect lands on once the (optional) choice is made. */
export type EffectTarget =
  | 'chosen'
  | 'self'
  | 'enemy_hero'
  | 'ally_hero'
  | 'all_enemy_units'
  | 'all_ally_units'     // includes the source
  | 'other_ally_units'   // excludes the source
  | 'all_other_units'    // every unit on the board except the source
  | 'random_enemy_unit'
  | 'random_enemy';      // a random enemy unit or the enemy hero

export type Effect =
  | { k: 'damage'; n: number; t: EffectTarget }
  | { k: 'heal'; n: number; t: EffectTarget }
  | { k: 'buff'; atk: number; hp: number; t: EffectTarget }
  | { k: 'draw'; n: number }
  | { k: 'freeze'; t: EffectTarget }
  | { k: 'bounce'; t: EffectTarget; maxCost?: number }
  | { k: 'summon'; token: string; n: number }
  | { k: 'tide'; n: number }
  | { k: 'grant'; kw: Keyword; t: EffectTarget }
  | { k: 'destroy'; t: EffectTarget; maxPower?: number }
  | { k: 'chain'; n: number };  // n separate 1-damage hits on random enemies

export type Trigger = 'play' | 'move' | 'death' | 'turn_start';

export interface Ability {
  when: Trigger;
  /** Tide cost; only for `move`. */
  cost?: number;
  /** Shown on the card, e.g. "Scorch". Moves always have one. */
  name?: string;
  target?: TargetSpec;
  effects: Effect[];
}

export interface CardDef {
  slug: string;
  name: string;
  tier: Tier;
  element: Element;
  cost: number;
  power: number;
  health: number;
  keywords: Keyword[];
  abilities: Ability[];
  image: string;
  wiki?: string;
  /** e.g. "Raid: Orphion's Nexus of Light". */
  origin?: string;
  /** Hand-written signature rather than generated from the tier template. */
  signature?: boolean;
}

// --- Game state ------------------------------------------------------------

export type Side = 0 | 1;

export interface CardInst {
  uid: string;
  slug: string;
}

export interface Unit {
  uid: string;
  slug: string;
  power: number;
  health: number;
  maxHealth: number;
  keywords: Keyword[];
  /** Can attack or use its move this turn. */
  ready: boolean;
  shield: boolean;
  stealth: boolean;
  /** Cannot act while state.turn <= frozenUntil. */
  frozenUntil: number;
}

export interface PlayerState {
  name: string;
  /** Minecraft uuid for the hero portrait; empty for the practice bot. */
  avatar: string;
  hp: number;
  tide: number;
  maxTide: number;
  deck: CardInst[];
  hand: CardInst[];
  board: Unit[];
  graveyard: string[];
  fatigue: number;
  /** Second player's one-off +1 tide. */
  pearl: boolean;
  mulliganed: boolean;
  timeouts: number;
  /** The tank's element, which picks its ability (rules.ts tankAbility). */
  tank: Element;
  /** The Tank ability has been used this turn. */
  tankUsed: boolean;
}

export type TargetRef = { kind: 'hero'; side: Side } | { kind: 'unit'; uid: string };

export type LogEvent =
  | { k: 'start'; first: Side }
  | { k: 'turn'; side: Side; turn: number }
  | { k: 'play'; side: Side; slug: string; uid: string }
  | { k: 'attack'; side: Side; uid: string; target: TargetRef }
  | { k: 'move'; side: Side; uid: string; name: string }
  /** hp: the target's health right after this event, for step-by-step replay. */
  | { k: 'damage'; target: TargetRef; n: number; hp?: number }
  | { k: 'shield'; uid: string }
  | { k: 'heal'; target: TargetRef; n: number; hp?: number }
  | { k: 'death'; side: Side; slug: string; uid: string }
  | { k: 'draw'; side: Side; n: number }
  | { k: 'burn'; side: Side; slug: string }
  | { k: 'fatigue'; side: Side; n: number }
  | { k: 'freeze'; uid: string }
  | { k: 'bounce'; uid: string; slug: string }
  | { k: 'pearl'; side: Side }
  | { k: 'tank'; side: Side; name: string }
  | { k: 'timeout'; side: Side }
  | { k: 'end'; winner: Side | null; reason: EndReason };

export type EndReason = 'hero' | 'concede' | 'timeout' | 'turn_limit';

export interface GameState {
  /** Ruleset version, so a stored game can refuse rules it was not started under. */
  rules: number;
  rng: number;
  phase: 'mulligan' | 'main' | 'over';
  turn: number;
  active: Side;
  first: Side;
  players: [PlayerState, PlayerState];
  winner: Side | null;
  endReason: EndReason | null;
  nextUid: number;
  log: LogEvent[];
  /** Index of log[0] in the full event stream, so clients can ask "since N". */
  logBase: number;
  /** Cards outside the static catalog (guild member cards), frozen at match start. */
  extraDefs?: Record<string, CardDef>;
}

export type Action =
  | { type: 'mulligan'; replace: string[] }
  | { type: 'play'; uid: string; target?: TargetRef }
  | { type: 'attack'; uid: string; target: TargetRef }
  | { type: 'move'; uid: string; target?: TargetRef }
  | { type: 'tank'; target?: TargetRef }
  | { type: 'pearl' }
  | { type: 'end_turn' }
  | { type: 'concede' }
  /** System action: the active player's clock ran out. */
  | { type: 'timeout' };

/** What one player is allowed to see. */
export interface GameView {
  rules: number;
  phase: GameState['phase'];
  turn: number;
  active: Side;
  first: Side;
  you: Side;
  winner: Side | null;
  endReason: EndReason | null;
  players: [PlayerView, PlayerView];
  log: LogEvent[];
  logBase: number;
  extraDefs?: Record<string, CardDef>;
}

export interface PlayerView extends Omit<PlayerState, 'deck' | 'hand'> {
  deckCount: number;
  handCount: number;
  /** Only present for the viewer's own side. */
  hand?: CardInst[];
}
