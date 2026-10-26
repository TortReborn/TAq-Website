# Warfront

A third ruleset for Tank Duels, beside the card duel (`../README.md`) and
Three-Front War (`../war/README.md`). It uses the same cards, decks, deck
rules, collections and match table. The difference is the table itself:
**alternating turns on a grid**, chess and Go style, built around the
Wynncraft war structure. Hold territories, connect them to your HQ, and
snipe the enemy HQ once its connections are cut. Nothing is simultaneous
and nothing is hidden except hands and decks, so the game is about
strategy, not prediction.

Every number is a knob in `config.ts` (`GRID`). The lab runs it with
`node scripts/duel-lab.mjs <cmd> --ruleset=grid` (flags below).

## Server and client

- **Storage.** `duel_matches.ruleset` is `'grid'` and `state` is a
  `GridState`. `sql/create_card_duels.sql` widens the ruleset check
  idempotently. `node scripts/duel-migrate-dev.mjs` applies it to the local
  dev database and refuses any other host.
- **Store** (`../store.ts`).
  - Practice: the bot mulligans when the game is created. It plays each of
    its turns inside the request that handed it the turn, so the player
    always gets the board back on their own turn.
  - Friendly: a lazy clock of `GRID_TURN_SECONDS` (60) a turn. The next
    request after a deadline ends the idle player's turn, one timeout per
    missed deadline. Three missed turns in a row forfeit. The mulligan uses
    `MULLIGAN_SECONDS` (45).
  - Every write bumps `version`, and actions carry the version the client
    saw, as in the duel (409 when stale).
- **API.** The same routes as the duel.
  - `POST /api/duels/matches` takes `ruleset: 'grid'`. Practice games also
    take `size: 5 | 7` (default 7). Friendly games are 7×7: there is no
    column for board options, and 5×5 is the smaller preset.
  - **Size presets.** A size whose preset (`GRID_PRESETS` in `config.ts`)
    is not empty stores its whole config in `GridState.cfg` when the game
    is made, so the game keeps its numbers for life. Today that is 5×5
    (`hqReach: 1`). 7×7 games have no `cfg` and read `GRID`. Every
    engine and client helper reads the rules through `rulesOf(board)`, and
    the view carries `cfg`, so the browser plays by the same numbers.
  - `POST /api/duels/matches/:id/action` takes `{ version, action }`, where
    the action is one `GridAction` (`types.ts`), rebuilt field by field in
    the route and then checked by the engine. Tiles are integers.
  - The match payload carries `ruleset: 'grid'`, `gridView` (a `GridView`,
    `view.ts`) and `yourTurn`. `view`, `warView`, `lockedIn` and
    `opponentLockedIn` are null.

  | Action | Fields | Uses |
  |---|---|---|
  | `mulligan` | `replace: uid[]` | the opening, once |
  | `deploy` | `uid, tile, target?` | emeralds; no order |
  | `move` | `uid, to` | starts the unit's order (1 order) |
  | `attack` | `uid, target` (a tile) | after its move, or as a whole order |
  | `ability` | `uid, target?` | the card's move ability (emeralds), once a turn; with `abilityAttack` the order stays open, so the unit may still attack or brace |
  | `brace` | `uid` | after its move (a full brace). In place it is free and is the end-of-turn stance taken early (`braceCost` 0) |
  | `hq` | `target?` | the tank ability: 1 order and emeralds, once a turn |
  | `end_turn`, `concede` | | |

- **Client** (`client.ts`) is the single browser-safe import. Every helper
  takes the player's `GridView`, so the UI offers exactly what the server
  accepts.

  | Helper | Returns |
  |---|---|
  | `unitOrders(view, uid)` | whether it can act, move tiles with paths, attack targets, its ability's cost, targets and `used`, brace |
  | `attacksFrom(view, uid, tile)` | what it could hit from a tile, to highlight before moving |
  | `previewAttack(view, uid, target)` | damage, flank, armour soaked, kill, strike-back, Pierce's second hit |
  | `deployOptions(view)`, `deployTargets(view, uid, tile)` | cards: cost (after any discount), affordable, deploy tiles (forward or not), on-play targets |
  | `deployDiscount(view, side)`, `reinforced(view, side)`, `setbackOf(view, side)` | the comeback rules now: card discount, whether reinforcements apply, a setback |
  | `rulesOf(view)`, `gridRulesFor(size)`, `GRID_PRESETS` | the rules a game plays under (pass these to the text helpers) |
  | `braceShare(view, unit)`, `braceCost(rules)`, `outnumberedBonus(view, side)` | what a brace or stance lets through, what a brace costs, the outnumbered bonus |
  | `hqOptions(view)` | the tank ability: cost, usable, targets |
  | `connection(view)` | per side: network tiles, connected nodes, HQ armour, HQ fire |
  | `legalActions(view)` | the flat list the engine checks against |
  | `isYourTurn(view)` | whether it is your move |
  | text | `gridMoveText`, `gridCardMoveText`, `gridKeywordText`, `gridCombatText`, `gridHqText`, `gridTurnText`, `gridTerrainText`, `gridTankText`, `gridBraceText`, `gridComebackText`. Each takes an optional last argument, the rules (`rulesOf(view)`); without it they describe 7×7 |
  | reference | `gridGuide(of?)` (every knob, the layouts, the clocks; `of` is a size or a view), `tileOf`, `tileXY`, `neighbours`, `distance`, `LAYOUTS` |

  Types: `GridView`, `GridPlayerView`, `GridUnit`, `GridNode`, `GridAction`,
  `GridEvent`, `Terrain`, `HitRef`.
- **The log** (`view.log`, from `view.logBase`, the last 600 events) replays
  a turn step by step. `GridEvent` in `types.ts` lists every event:
  - `turn` (with its orders), `income` (base, nodes, city), `draw`;
  - `hqfire`, followed by its `damage`;
  - `deploy` (and whether it was a forward deploy) and `summon`;
  - `move`, with every tile entered and whether a Guard stopped it;
  - `attack`, with `flank` and `ranged`, followed by its `damage`;
  - `damage`, with the health left and the armour or brace that softened it;
  - `retaliate` and `pierce`, each followed by a `damage`;
  - `shield`, `heal`, `freeze`, `bounce`, `reveal`, `ability`, `hq`;
  - `brace`, with `auto` for the free end-of-turn stance (logged after the
    turn's claims, before `end_turn`);
  - `deploy` may carry `ready` (a reinforcement that can act at once; off);
  - `setback` and `laststand` (comeback rules that are off by default);
  - `death`, with `captured` for surround captures;
  - `claim`, with who held the node before;
  - `connection`, a side's connected nodes whenever they change;
  - `end_turn`, `end`.
- **The board UI is not built.** The lobby and battle pages still know only
  'duel' and 'war'. A grid match started through the API would open the
  duel board.

## Rules

The current rules are "Rules v2 as built": v1 below plus the changes in that
table. The brief's rules v0 and every measured change are in the two
experiment logs (v1, then v2).

## Rules v2 as built

`GRID_RULES_VERSION` grid-2. Everything in "Rules v1 as built" holds except
these lines, one each as a player reads them. Every one is a knob in `GRID`.

| Rule | As built | Knobs |
|---|---|---|
| **Free stance** | At the end of your turn, every unit of yours that did not attack or use its ability is braced through the enemy's turn: it takes three quarters of the damage (rounded down). A brace ordered after a move is still a full brace (half). Both players see both. | `autoBrace: 'passive'`, `autoBraceTaken: 0.75`; a brace in place costs no order (`braceCost`) |
| **Reinforcements** | While you have fewer units on the board than your enemy, your cards cost 3 emeralds less (never below 1). | `reinforceDiscount: 3`, `reinforceGap: 1` |
| **Air** | Flies up to 2 diagonally as before, **or walks 1 tile straight** (up, down or sideways; blocked like anyone). Air is no longer stuck on one colour of the board. | `airStep: 1` |
| **Abilities** | A unit's move ability no longer ends its order: it may still attack (or brace) after it. Once a turn. | `abilityAttack: true` |
| **Turn limit** | 16 turns each (v1: 14). HQ health stays 12. | `turnLimit` |
| **Second player** | No extra emerald (v1: +1); the first player's 2 orders on turn 1 stay. | `secondBonus: 0` |
| **Board sizes** | Each size has a preset, stored in the game: 5×5 sieges only from next to the HQ (`hqReach: 1`). | `GRID_PRESETS` |
| **Prices** | Unchanged (grid-1). Two refits under the v2 rules measured worse (v2 log). | `balance-coefficients.json` |

**Built, measured, and off** (each a knob; the v2 log has the numbers):
- **Setback**: extra orders, emeralds or a discount the turn after the enemy
  cuts one of your connected nodes or hits your HQ hard (`setbackOn`,
  `setbackOrders`, `setbackEmeralds`, `setbackDiscount`, `setbackHq`).
- **Outnumbered**: +damage while you have fewer units (`outnumbered`).
- **Last stand**: a once-a-game HQ repair at half health (`lastStand`,
  `lastStandAt`).
- **Reinforcements act at once** (`reinforceReady`).
- **HQ fire** reach and shots (`hqFireReach`, `hqFireShots`).
- **The 'idle' stance**, which braces only units that did not act at all,
  so a unit that moved still needs an ordered brace (`autoBrace: 'idle'`).

## Rules v1 as built

`GRID_RULES_VERSION` grid-1 (v2 changes some lines, above). One line each, as a player reads them:

| Rule | As built | Knobs |
|---|---|---|
| **Board** | 7×7 (or the 5×5 preset), point-symmetric. Your HQ is in the middle of your back row; the rest of that row is your deploy zone. Two layouts per size (`layouts.ts`), picked by the seed. | `size`, `layout` |
| **Nodes** | 5 on 7×7 and 3 on 5×5, the centre one a city. Each is named after a real territory (`../war/territories.json`) and has its main resource. Mirrored nodes share a resource. | |
| **Terrain** | Mountains block movement for everyone but Air, and block Ranged sight. Entering water ends a move, except for Water. | |
| **Turns** | Upkeep, then up to 3 orders, then end turn. Upkeep: emeralds, draw 1, perks, then your HQ fires. | `orders` |
| **Orders** | One unit moves, then may attack, use its move ability (emeralds) or brace. Each unit acts once a turn. The tank ability is an order too. | `braceOrders` |
| **Deploy** | Costs emeralds, not an order. Goes on your back row, or next to a connected node you hold. Never next to an enemy unit ("contested ground"). New units act next turn unless they have Rush. At most 7 of your units on the board. | `contested`, `maxUnits` |
| **Costs** | Emeralds = ceil(0.6 × the card's tide cost), for cards, moves and the tank ability. | `costScale`, `moveCostScale` |
| **First turn** | The first player (a coin flip) has 2 orders on turn 1 and skips its draw. The second starts with 1 emerald. | `firstOrders`, `secondBonus` |
| **Movement** | Earth: 1 step, any direction. Thunder: up to 3 in a straight orthogonal line, blocked by units and mountains. Air: up to 2 diagonally, flying over units and mountains, landing on an empty tile. Fire: up to 2 steps, any direction. Water: 1 step, or up to 3 along water tiles. | `movement`, `range` |
| **Speed** | A quarter of cards are fast (+1 range, 1 less health), a quarter slow (−1 range, never below 1; 1 more health), rolled from the slug as in war. For Water it changes the river run. | `speed`, `fastShare`, `speedHealth` |
| **Attack** | An enemy on one of the 8 tiles around you. Ranged: a straight line (8 directions) up to 2 tiles, every tile between clear. **Siege:** the enemy HQ can be attacked from up to 2 tiles away. | `adjacency`, `rangedReach`, `hqReach` |
| **Strike back** | A melee defender that survives strikes back for its power. Ranged attackers are never struck back, and Ranged defenders do not strike back. | `retaliation` |
| **Flanking** | +1 damage for each other friendly unit next to the target, up to +3. HQ attacks too. | `flank`, `flankCap` |
| **Brace** | An order: take half damage (rounded down) until your next turn. Visible to both players. | `braceTaken`, `braceOrders` |
| **Guard** | Zone of control: an enemy that moves next to a Guard must stop there. | |
| **Stealth** | Cannot be targeted until it attacks or uses its ability, or an enemy ends a move next to it. | |
| **Pierce** | Also hits the enemy (unit or HQ) straight behind its target, for its power. | `pierceShare` |
| **Others** | Shield soaks the first hit. Drain would heal your HQ, but HQs cannot be healed (below). Regen heals 2 (×1.5) a turn. Freeze: cannot act or strike back through its side's next turn. | |
| **Health** | Unit health is the card's ×1.5 (heals and health buffs too), so a unit takes two or three hits. | `healthMult` |
| **Claim** | End your turn with a unit on a node and no enemy next to it. The node is yours until the enemy does the same. | |
| **Connection** | A node is connected when a chain of orthogonally adjacent tiles, each holding your unit or your node, links it to your HQ. An enemy standing on one of your nodes breaks the chain there. | |
| **Connected nodes** | Each gives +1 emerald a turn, deploys next to it, and +1 HQ armour: every hit on your HQ does 1 less, never below 1. Disconnected nodes give nothing. | `nodeIncome`, `armourPerNode`, `armourMin` |
| **Perks** | Connected nodes give their resource's perk: city +1 emerald; ore +1 power to your unit on it; crops heal it 2; fish draw 1 every other turn; wood repairs the HQ 1 (0 now: no HQ healing). | `perks`, `perk`, `fishEvery` |
| **HQ** | 12 health. It fires for 2 at one adjacent enemy at the start of your turn (one it can kill, else the strongest). HQs cannot be healed. | `hqHp`, `hqFire`, `hqHealShare` |
| **Economy** | +2 emeralds a turn, +1 every 2 of your turns, +1 per connected node. Catch-up: +1 while you have fewer connected nodes than your enemy. Bank cap 8. | `income`, `incomeStep`, `catchUp`, `bankCap` |
| **Win** | Destroy the enemy HQ. At the turn limit (14 turns each): most connected nodes, then HQ health, then a draw. | `turnLimit` |
| **Cards, decks, fairness** | Unchanged: 20 cards, the duel's deck rules and ownership, and the practice bot's rule-built decks. Hand 4, max 8. Cards are priced for Warfront (below). | `startHand`, `handMax` |

- **Surround capture** (a control, off). A unit with no free orthogonal
  neighbour (walls, edges and enemies count; friends do not) is destroyed at
  the end of its enemy's turn (`surround`).
- **Knobs built and measured but off:** `hqAura` (units next to their own
  HQ +1 health), `hqFireRamp`, `rally`, `deathRebate` and `effectRange`.

### Effect remapping

The engine header (`engine.ts`) has the full table. In short:
- "Chosen enemy" is a visible enemy unit or the enemy HQ, and "ally" is your
  unit or your HQ.
- "Enemy/ally tank" is that HQ, and armour applies to damage.
- "All ..." means every matching unit on the board, and "random enemy"
  covers the HQ.
- Summons land on the empty tile next to the source that is nearest the
  enemy HQ. The tank abilities (Flare, Spark, Mend, Raise Wall, Scout)
  work from the HQ.
- Targeted effects reach the whole board (`effectRange` 0).

### Movement and speed: how it was decided

The brief asked for card speed (war's fast/normal/slow roll) to adjust range
by ±1 within each element's pattern:
- **The range changes.** Earth's step count, Thunder's line, Air's diagonal,
  Fire's steps and Water's river run each go up or down by one, never below 1.
- **The pattern doesn't.** A fast Earth unit walks 2 king steps, which Fire
  also does, but it keeps Earth's stats.
- **Speed is paid in health, as in war.** A fast unit has 1 less, a slow one
  1 more.

Air is diagonal-only, like a bishop, so each Air unit keeps to the colour of
the tile it was deployed on. That's faithful to the brief, and it shows in
the numbers (below).

## Prices

Rules v2 keeps these grid-1 prices: two refits under the v2 rules did worse
in leagues (v2 log).

Warfront has its own card prices, `balance-coefficients.json` here, read by
`cards.ts` (`gridCard`), and the live game uses them, not only the lab.
Three-Front War has its own price file too, and since war-3.2 live war games
use it (`../war/cards.ts`, `warCard`).
- **How they were fitted.** Start from the duel's prices with the tier
  bonus at 0, as the war found best. Then `tune --ruleset=grid --fixstats
  --normaloffsets --elimit=2.5` (8 rounds of 6,000 games; power and health
  weights held, as in war).
- **What changed.** Per-element offsets for all cards and for normals were
  refitted, and keyword and effect prices moved. Free mono-element decks now
  sit at 44–58% each (mostly 46–51%).
- **Signatures.** Her Majesty and Syndra use their war versions
  (`../war/signatures.ts`), as in war: their duel kits price past their cost.
- **Kits.** Card cost, tier and element are the duel's. About 8% of cards
  get a different kit, because a roll that no longer fits its budget is
  re-rolled. A Warfront UI must show `gridCard(slug)`.
- **Member cards** (`extraDefs`) are built by the store at duel prices,
  here as everywhere.

Why a price file at all: on duel prices, veteran decks beat free ones 79–92%,
earth and thunder all but vanished from the elite decks, and starters spread
0.80/0.28 (three seasons, table below).

## The bot (`ai.ts`)

Turns alternate, so the bot builds on the duel's (`../ai.ts`): sequential
actions with a plan search.
- **Candidates.** An order is a unit's move (or staying put) plus a
  follow-up: an attack, its ability, a brace, or nothing. Each gets a quick
  prior:
  - damage and kills, strike-back taken, HQ damage after armour;
  - claiming a node, standing on an enemy node (which cuts its chain);
  - advancing toward the enemy HQ, and HQ fire;
  - whether enemies can reach it next turn.

  The best `prune` (14) are simulated, plus each unit's best two. Deploys
  (each affordable card on a few tiles: most forward, nearest home, safest)
  and the HQ ability are candidates too.
- **Greedy.** Simulate every candidate, score it, take the best, and repeat
  until nothing beats ending the turn.
- **Plan search** (`mode: 'full'`, the practice bot and the lab):
  1. Take the `width` (4) best first steps.
  2. Finish each one greedily.
  3. Score each plan's end state after the opponent's best greedy reply,
     with its board and HQ only (its hand is hidden).
  4. Play out the best plan. If a random effect makes a planned step
     illegal, finish the turn greedily.
- **Evaluation** (`GRID_EVAL`):
  - HQ health (steeper when low);
  - connected nodes, then owned ones, and the city;
  - hand, emeralds;
  - unit stats, advance, standing on nodes;
  - a danger term for the side about to be attacked: the enemy's best 3
    attackers in reach, with flanking and HQ fire;
  - HQ threat and pressure.

  Head-to-head, lower danger (0.25–0.3) played about even with the default
  (0.5); higher danger (0.8) lost 43%.
- **v2.** The evaluation counts the free stance: a unit that has not
  attacked (or acted, under 'idle') is scored as braced for the enemy's
  turn. A brace in place is not offered while the stance is free. A unit
  with a move ability is also offered "ability, then attack" as one order.
- **Hidden information.** The bot never peeks. Its own deck is shuffled with
  its own seed, the opponent's hand and deck are emptied, and every
  simulation runs on a fresh RNG seed.
- **Speed:** about 7 ms a bot turn. 55–70 games a second on 18 workers with
  both seats on plan search; 115–190 with a greedy or random seat. Width 4
  beats width 2 57.8% (600 games).

## Lab

`node scripts/duel-lab.mjs <cmd> --ruleset=grid [flags]`:
- **Commands:** `season` (the evolved league with niches and starters,
  veteran vs free), `tune`, `free`, `gprobe` (traced random-deck games with
  every grid stat), `gversus --a=full --b=greedy|random` (the skill guard).
- **Board flags:** `--size=5`, `--layout=Name`, `--movement=uniform`,
  `--flank=0`, `--surround=1`, `--grid='{...}'` (any `GridConfig` fields).
- **Bot flags:** `--gwidth`, `--prune`, `--reply=0`, `--geval='{...}'`,
  and `--aeval`/`--beval` for gversus.
- **Output.** Season reports carry `report.grid` (`sim.ts`,
  `summarizeGrid`): HQ vs limit wins, snipes with nodes still connected,
  claims and steals, node-lead swings, board coverage, the order mix, moves
  and tiles per element, flanking, Guard stops, strike-backs, HQ fire and
  armour, deaths, and each element's win share.
- **Season size here:** `--gens=20 --pop=8 --games=12 --traced=1000`, about
  5 minutes each on 18 workers.

Lead, for the engagement numbers = HQ health + 2 per connected node + half
the board's stats. It is sampled after every player-turn and read per turn
pair (`perExchange`), like the other two rulesets.

## Experiment log

All probes are `gprobe` (300–800 traced random-curve-deck games). The
probe's decided early, comebacks and lead changes land within a few points
of the elite leagues (C1: probe 57/32/0.59, elite 58/28/0.61), so probes
were used for screening. Each probe carries about ±3–5 points.

**Rules v0 as briefed** (HQ 20, fire 2, aura +1, armour 1 per node, 12
turns each, income 2 + nodes):

| Probe | Limit | HQ damage/game | Seat 1 | Early | Note |
|---|---|---|---|---|---|
| v0, first eval | 95% | 4.2 | 32% | 65 | 44% of orders braces; stall |
| v0, new eval (threat capped at 3 attackers) | 95% | 5.3 | 30% | 63 | the bot was not the stall |
| v0, Riverlands redesigned (chains 1–2 units) | 88% | 6.5 | 32% | 68 | the first Riverlands needed 3-unit chains; nobody ever connected |
| v0, turn limit 25 | 35% at 25 | 22.7 | 43% | 68 | natural length 19 turns each |

Seat 1 is the first player. At the limit, the second player moves last,
which is why the first player lost so much while games ended on the limit.

**What stalled it** (one at a time on v0, then on the running base):
- **HQ fire and the aura** made walls next to the HQ very strong. The HQ's
  deploy tiles are also its wall, and deploying costs no order, so a
  defender re-plugs any gap for free.
- **Contested ground** (no deploys next to an enemy) helped a little.
- **Board width.** Most of all, a 7-wide board filled by 6–7 units a side
  locks into trenches. On 5×5 the same rules ended in 8 turns each with 15%
  at the limit.
- **Healing HQs** undid sieges: Mend, Renew and the wood perk took one HQ
  from 7 back to 12 in a turn.
- **Tested but not the cause:** more orders, income 3, starting emeralds,
  a unit cap alone, flank 2, no strike-back, and the comeback knobs (rally,
  HQ fire ramp, death rebate).

**Key screens** (turns each / % at limit / decided early / comebacks / lead changes / first-player %):

| Config | Each | Limit | Early | Cb | LC | Seat | Verdict |
|---|---|---|---|---|---|---|---|
| contested, aura 0, fire 1, HQ 12 | 11.0 | 69 | 71 | 23 | 0.48 | 36 | still stalls |
| + income +1 every 3 turns | 11.2 | 77 | 58 | 31 | 0.68 | 34 | growth lifts drama, not pace |
| + HQ reach 2 (siege from 2 tiles) | 9.4 | 31 | 56 | 33 | 0.68 | 44 | **kept**: breaks walls |
| + no HQ healing, 6-unit cap (B2) | 9.0 | 24 | 54 | 29 | 0.64 | 47 | kept |
| B2, HQ reach 1 | 11.2 | 77 | 49 | 36 | 0.76 | 33 | reach 2 is essential |
| B2, aura 1 | 9.7 | 41 | 55 | 34 | 0.62 | 45 | aura stays off |
| B2, fire 2 (C1) | 9.0 | 23 | 55 | 31 | 0.65 | 46 | fire 2 = fire 1: **back to the brief's 2** |
| B2, HQ 16 / HQ 20 | 10.1 / 10.8 | 40 / 57 | 52 / 53 | 36 / 38 | 0.71 / 0.73 | 49 / 41 | HQ health trades pace for drama |
| B2, no income growth | 8.8 | 21 | 65 | 24 | 0.54 | 46 | growth needed for drama |
| B2, armour 0 | 7.6 | 7 | 60 | 27 | 0.51 | 46 | armour makes games longer and swingier |
| C1, no strike-back | 9.4 | 33 | 47 | 38 | 0.70 | 51 | better drama, but the brief's rule; kept on |
| C1, health ×1.5 | 7.7 | 9 | 58 | 34 | 0.54 | 51 | attackers survive to siege |
| C1, no node income + catch-up 1 | 9.2 | 26 | 47 | 39 | 0.73 | 48 | catch-up helps; node income kept (brief) |
| C1, ×1.5, catch-up 1, income +1 every 2 | 8.0 | 13 | 45 | 41 | 0.65 | 51 | near |
| … + 14-turn limit, 7-unit cap (**v1**) | 8.3 | 9 | 44 | 43 | 0.67 | 51 | **shipped** |
| v1, HQ 16, 16-turn limit | 10.1 | 13 | 43 | 47 | 0.79 | 49 | the only config near 0.8 lead changes |
| v1, flank 2 | 8.3 | 9 | 41 | 45 | 0.70 | 52 | small gain; flank stays the brief's 1 |

## Results (rules v1, grid-1 prices)

Leagues: 20 generations, 8 decks a niche, 12 games a deck, 1,000 traced
elite games a season. Bot-measured, about ±5–10 points a season; bands are
the spread over three seasons (seeds 2026, 3026, 4026).

| | Target | v1, duel prices (3) | **v1, grid prices (3)** | 5×5, same rules (1) |
|---|---|---|---|---|
| Decided early (per turn pair) | ≤ 45% | 52–57% | 47–50% (miss by 2–5) | 69% |
| Comebacks | 35–45% | 34–41% | 44–46% | 21% |
| Lead changes per game | 0.9–1.4 | 0.49–0.59 | **0.54–0.62 (miss)** | 0.33 |
| Veteran vs free, top 5 | 58–68%, never < 55% | 79–92% | 66 / 73 / 80% (1 of 3 in band) | 62% |
| Plan search vs greedy (3,000) | ≥ 65% | 67.0% | **72.6%** | |
| Plan search vs random (1,200) | ≥ 95% | 99.8% | **99.9%** | |
| First player | 47–53% | 46–51% | 49–54% | 49% |
| Turns each; at the limit | 8–12; < 10% | 6.7–7.6; 2–4% | **8.0–8.2; 5–6%** | 3.9; 0% |
| Starters best / worst | 40–60% | 0.80/0.28–0.32 | 0.60–0.65 / 0.37–0.45 | 0.72/0.32 |
| Elite elements (of 20) | all present, none > 8 | earth, thunder 0–1 | all five, max 6 and 8, then earth 11 with air 0 | air absent, thunder 9 |
| Distinct choices a turn | report | 40–46 | 43–47 | 23 |
| Actions a turn | | 2.8 | 2.65–2.8 | 2.2 |

**Warfront-only numbers** (elite games, three grid-price seasons):
- **Endings.** 94–95% of games end by HQ destruction and 5–6% at the limit.
  Snipes with the loser's nodes still connected: 65–84%. HQs usually fall
  armoured: armour soaks 22–23% of HQ damage.
- **Nodes.** 4.3 claims a game, 0.2–0.5 of them taken from the enemy.
  Node-lead swings: 0.6–0.9 a game.
- **Coverage.** 64–66% of standable tiles are stood on at some point in a
  game.
- **Order mix:**

  | Order | Share |
  |---|---|
  | move + attack | 25–33% |
  | attack in place | 7–9% |
  | move only | 16–19% |
  | move + brace | 22–25% |
  | brace in place | 16–23% |
  | ability (with or without a move) | about 1% |
  | tank ability | 1–2% |

  About 1.73 orders are used of 3, plus 1.0–1.1 deploys a turn; 31% of
  deploys are forward (next to a connected node).
- **Movement by element** (share of that element's orders that moved; mean
  tiles a move):

  | Element | Moved | Tiles |
  |---|---|---|
  | Fire | 82% | 1.80 |
  | Air | 74–80% | 1.61–1.64 |
  | Thunder | 70–73% | 1.59–1.62 |
  | Earth | 70–74% | 1.23–1.27 |
  | Water | 67% | 1.24 |

  Water rarely uses its river run: 1.24 tiles against a range of 3.
- **Guard walls and flanking.**
  - Guard stops 0.5–0.8 moves a game.
  - 29–30% of attacks are flanked, +0.36–0.38 damage an attack on average.
  - Strike-backs: 0.25–0.6 a game. The bot mostly attacks when it can kill,
    or with Ranged.
- **Element win share** (elite games) swings from season to season:

  | Element | Win share |
  |---|---|
  | Thunder | 0.29–0.60 |
  | Water | 0.40–0.63 |
  | Fire | 0.46–0.56 |
  | Air | 0.39–0.52 (absent in season 3) |
  | Earth | 0.43–0.51 |

**Controls** (probes, 800 random-deck games each; the v1 row is the same
probe with nothing changed):

| | Each | Limit | Early | Cb | LC | Seat 1 | HQ wins | Note |
|---|---|---|---|---|---|---|---|---|
| v1 | 8.9 | 10.6% | 51 | 41 | 0.59 | 49 | 89% | element wins 0.43–0.56 |
| Element movement off (all move 2 orthogonally) | 10.4 | 27% | 58 | 36 | 0.55 | 45 | 73% | fire 0.35 and air 0.34, earth 0.63: element movement is what makes attackers faster than defenders |
| Flanking off | 8.4 | 5.8% | 51 | 41 | 0.54 | 50 | 94% | about the same; flanking adds 0.4 damage an attack |
| Surround capture on | 8.9 | 10.8% | 51 | 41 | 0.58 | 51 | 89% | 0.013 captures a game: almost never happens |
| 5×5 | 4.3 | 0% | 70 | 19 | 0.31 | 51 | 100% | far too fast on these rules |
| 5×5, HQ reach 1 | 7.9 | 6% | 64 | 29 | 0.53 | 50 | | the recommended 5×5 values (not wired: GRID is one config) |
| 5×5, HQ reach 1, HQ 16 | 9.2 | 15% | 67 | 27 | 0.58 | 46 | | |

## Results (rules v2, grid-1 prices)

Same leagues as v1: 20 generations, 8 decks a niche, 12 games a deck,
1,000 traced elite games, seeds 2026, 3026, 4026. Bot-measured, about ±5–10
points a season; a band is the spread over the three seasons.

| | Target | v1 (3) | **v2 (3)** | 5×5 v2 (1) |
|---|---|---|---|---|
| Decided early | ≤ 45% | 47–50% | 47–53% (miss) | 65% |
| Comebacks | 35–45% | 44–46% | 45–53% (over in 2) | 38% |
| Lead changes per game | 0.9–1.4 | 0.54–0.62 | **0.56–0.65 (miss)** | 0.60 |
| Veteran vs free, top 5 | 58–68%, never < 55% | 66 / 73 / 80% | 57 / 74 / 80% (1 of 3 in band) | 86% |
| Plan search vs greedy (3,000) | ≥ 65% | 72.6% | 67.6% | |
| Plan search vs random (1,200) | ≥ 95% | 99.9% | 100.0% | |
| First player | 47–53% | 49–54% | 46–49% | 43% |
| Turns each; at the limit | 8–12; < 10% | 8.0–8.2; 5–6% | 8.5–9.6; 8–14% (1 of 3 over) | 8.7; 13% (target 6–9) |
| Starters best / worst | 40–60% | 0.60–0.65 / 0.37–0.45 | 0.58–0.73 / 0.29–0.45 | 0.82 / 0.22 |
| Elite elements (of 20) | all present, none > 8 | 2 of 3 balanced | all five, max 6, once; fire 9 with air 1 twice | air, thunder absent |
| Distinct choices a turn | report | 43–47 | 43–51 | 27 |
| Actions a turn | | 2.65–2.8 | 2.5–2.6 | 2.7 |

**Order mix** (elite games; orders only, so the free stance is not counted):

| Order | v1 | **v2** |
|---|---|---|
| move + attack | 25–33% | 38% |
| attack in place | 7–9% | 6–7% |
| move only (the unit ends the turn in the stance) | 16–19% | 44–48% |
| move + brace | 22–25% | 0% |
| brace in place | 16–23% | 0% (the stance is free) |
| ability (with or without a move) | about 1% | 5.4–7.9% |
| tank ability | 1–2% | 2–4% |

- 1.48–1.49 orders a turn (v1 1.73) and 1.0–1.1 deploys. 4.3–4.6 units a
  turn end in the free stance. An ability is followed by an attack 0.5–0.8
  times a game.
- **Movement.** Every element moves in 86–95% of its orders (v1 67–82%).
  Air moves 91–93% of the time and walks or flies 1.36–1.53 tiles. Water
  still averages 1.19–1.23 tiles: its river run is rarely worth taking.
- **Endings.** 86–92% by HQ, 8–14% at the limit. Snipes with nodes still
  connected: 74–78%. Armour soaks 25–28% of HQ damage.
- **Nodes.** 4.3–4.4 claims a game, 0.3–0.5 steals, about one node-lead swing
  a game (v1 0.6–0.9).
- **Element win share** in elite games: fire 0.46–0.57, water 0.40–0.54,
  thunder 0.42–0.54, earth 0.34–0.55, air 0.29–0.68 (few air elites).

**5×5** (preset `hqReach: 1`, one season, plus a 1,000-game probe at 9.0
turns each and 9% at the limit). Length is in its 6–9 band. Everything else
is far off and was not tuned further: decided early 65%, comebacks 36–38%,
earth 0.71 and thunder/fire/air 0.34–0.37 in the probe, and veterans 86%.
A 5-wide board with reach-1 sieges favours the sturdy elements, which wall
the three tiles next to the HQ.

## Experiment log (v2)

Screens are `gprobe` (800–1,200 random curve decks, about ±3–5 points;
early / comebacks / lead changes per exchange, first-player %). v1 probe:
8.9 turns each, 11% at the limit, 50 / 43 / 0.58, 51%.

**Lead changes.** Single knobs, each on v1:

| Change | Each | Limit | Early | Cb | LC | Seat | Note |
|---|---|---|---|---|---|---|---|
| setback (node lost): +1 order | 8.9 | 10 | 50 | 43 | 0.56 | 51 | orders are not scarce: 1.8 of 3 used |
| setback (node or ≥3 HQ damage): +1 order | 9.1 | 13 | 49 | 42 | 0.57 | 51 | |
| setback (HQ): +1 order / (node): +2 emeralds / (node): cards 1 cheaper | 8.9–9.0 | 10–12 | 48–50 | 41–44 | 0.58–0.61 | 50–51 | |
| setback at the most (either: +2 orders, +3 emeralds, 2 cheaper) | 9.1 | 12 | 46 | 46 | 0.62 | 50 | strongest setback, still small |
| rally +1 order at half HQ / HQ fire ramp 3 / death rebate 1 | 8.9–9.1 | 11–12 | 49–50 | 43–45 | 0.59–0.60 | 49–53 | |
| catch-up +2 / +3 | 9.0–9.2 | 10–13 | 47 | 45–48 | 0.61–0.65 | 49–51 | |
| outnumbered +1 / +2 damage | 8.4–8.7 | 9–12 | 44–48 | 44–49 | 0.59–0.61 | 50–51 | |
| HQ fire reach 2 / 2 shots / both | 8.9–9.8 | 10–22 | 48–50 | 43–46 | 0.57–0.65 | 49–50 | |
| last stand 4 / 6 (once, at half HQ) | 10.1–10.6 | 22–29 | 50–53 | 41–42 | 0.60–0.65 | 47 | games drag |
| reinforcements act at once | 7.4 | 5 | 60 | 33 | 0.47 | 38 | snowballs the other way |
| **reinforcements: cards 2 / 3 / 4 cheaper while fewer units** | 9.1–9.2 | 14–15 | 51–54 | 46–52 | **0.72–0.74** | 43–47 | **the only lever found** |
| … only when 2 or more units behind | 9.0–9.2 | 12–13 | 49–50 | 43–45 | 0.62 | 49–50 | must be frequent to work |
| structural: HQ 16 / 16 turns; health ×1; no strike-back; armour 2; flank 2; bank 12; 2 or 4 orders; cap 5 | | | | | 0.58–0.67 | | none moves it by more than 0.09 |

Why so little moves it: the lead is HQ health + 2 per connected node + half
the board. Decomposed by exchange, the eventual winner's edge is board stats
first (exchanges 1–4) and HQ damage from exchange 5; nodes add little. With
alternating turns and a visible board, whoever builds the bigger board
first keeps converting it, and the mover's own turn swings the lead by 5–8
(sampling once per exchange filters that out). Only a frequent discount on
rebuilding the board pulls it back.

**The order mix.** On reinforcements 3:

| Brace rule | Each | Limit | Early | Cb | LC | Seat | Orders a turn | Note |
|---|---|---|---|---|---|---|---|---|
| ordered (v1) | 9.1 | 15 | 51 | 52 | 0.74 | 47 | 1.87 | braces 43% of orders |
| free, 'idle', half damage | 9.4 | 22 | 56 | 49 | 0.65 | 42 | 1.38 | free safety: the bot sits still |
| free, 'passive', half damage | 9.5 | 23 | 57 | 47 | 0.64 | 42 | 1.40 | |
| free, 'idle', three quarters | 9.0 | 14 | 53 | 50 | 0.69 | 46 | 1.68 | move + brace still 34% |
| **free, 'passive', three quarters** | 9.4 | 17 | 55 | 49 | 0.68 | 43 | 1.58 | no brace orders at all |

Air's orthogonal step: element wins 0.42 → 0.47–0.49 for air in probes, no
other change. Ability then attack: abilities 3.4% → 6.2–9.5% of orders in
probes.

**Leagues** (three seasons each; early / comebacks / lead changes / veteran
/ first player / turns each; limit):

| Config | Early | Cb | LC | Veteran | Seat | Each; limit | Verdict |
|---|---|---|---|---|---|---|---|
| C2: reinforcements 3, Air step, ability + attack, no second-player emerald, ordered brace | 54–58 | 43–50 | 0.51–0.63 | 73–81 | 43–47 | 7.7–8.9; 7–12% | worse than v1 |
| C1: C2 + free 'passive' stance at three quarters | 47–52 | 44–56 | 0.63–0.69 | 66–79 | 41–49 | 8.5–9.2; 13–17% | best drama, too many limit games |
| C1, HQ 10, refit prices | 50–54 | 45–48 | 0.55–0.62 | 74–85 | 46–47 | 7.9–8.2; 6–12% | refit worse |
| C1, HQ 11, refit with `--fittiers` and elite `--pressure` (rarity tax −1.5) | 48–54 | 43–46 | 0.50–0.58 | 66–80 | 45 | 7.2–8.6; 5–13% | refit worse |
| C1, HQ 11, grid-1 prices | 48–52 | 49–50 | 0.56–0.58 | 70–86 | 46–48 | 7.6–8.1; 8–10% | limit fixed, drama lost |
| **C1, 16-turn limit (v2)** | 47–53 | 45–53 | 0.56–0.65 | 57–80 | 46–49 | 8.5–9.6; 8–14% | **shipped** |

Both refits fitted the free decks well (mono decks 44–54%), but their elite
leagues came out worse on veterans and lead changes than the grid-1 prices,
so grid-1 stays. Under the refits Sovereign Majin and Sovereign Zhiraok
priced past their cost; with grid-1 they fit.

**5×5** (probes, v2 rules):

| Preset | Each | Limit | Early | Cb | LC | Elements |
|---|---|---|---|---|---|---|
| 7×7 values | 3.5 | 0 | 66 | 31 | 0.40 | thunder 0.66 |
| **HQ reach 1** | 7.8 | 8 | 64 | 36 | 0.58 | earth 0.69, thunder 0.32 |
| reach 1, HQ 12 / cap 5 / both / 10 turns | 7.3–8.8 | 14–20 | 64–67 | 35–36 | 0.54–0.62 | same skew |
| reach 1, HQ fire 1 / 0 / HQ 8 / thunder range 2 | 6.8–8.1 | 4–10 | 64–65 | 35–36 | 0.50–0.59 | same skew |
| reach 2, HQ 18 / 20 / 24 (with armour 2 or fire 3) | 5.2–6.4 | 0 | 62–69 | 31–35 | 0.44–0.50 | fire low |

## What is off, and what to try next (v2)

- **Lead changes (0.56–0.65) still miss 0.9–1.4.** Reinforcements are the
  one lever that moves them (+0.1 to +0.15 in probes), and every setback,
  rally, catch-up, last-stand and HQ variant moved them by 0.05 or less (v2
  log). Alternating turns on a visible board let whoever builds the bigger
  board first keep converting it.
  - Next: something that makes a lost unit cheap to answer on the same
    turn, or objectives that can be traded (several HQ-like targets, as the
    war's three towers), rather than more catch-up resources.
- **Decided early 47–53%** is still 2–8 over; comebacks 45–53% run a little
  high. The two moved together in every configuration, as in the war.
- **Veterans 57 / 74 / 80%.** Two price refits under v2 rules (one with a
  rarity tax from `--fittiers` and elite pressure) fitted free decks well
  but did worse in leagues. The 3026 seed runs 79–86% in almost every
  config, so part of this is the league itself.
- **Elements.** Air moves freely now, and air decks hold even in probes,
  but fire took 9 of 20 elites with air at 1 in two seasons.
- **Limit games 8–14%.** The free stance makes defence cheaper; the 16-turn
  limit brought it from 13–17% to 8–14%.
- **Fewer orders.** 1.5 orders a turn (v1 1.7). Every order is now a move,
  an attack or an ability, but with free safety the bot moves fewer units.
- **First player 46–49%** after the second player's extra emerald was
  removed (49% in probes).
- **5×5.** Length is right (8.7–9.0 turns each); everything else is not:
  decided early 65%, veterans 86%, earth over thunder, fire and air.
- **Still unchanged from v1:** Water's river run (1.2 tiles a move against
  3), and surround capture (inert, off).

## What was off in v1 (kept for the record)


- **Lead changes (0.54–0.62) miss 0.9–1.4 in every configuration.** The
  best was 0.79 (HQ 16, 16 turns each), at a cost in length. Alternating
  turns with visible boards reward whoever gets ahead first, and the one
  swing the design has, the snipe, mostly finishes a game the sniper was
  already winning.
  - Next: something that swings a turn pair back without adding luck. For
    example, a stronger second-player catch-up on the turn after losing a
    node, or armour that also slows the attacker's income.
- **Decided early is 47–50%**, 2–5 points over. Comebacks are in band.
- **Veterans are 66–80%.** Grid prices fixed the 79–92% of duel prices, but
  one season in three is still over.
  - Next: a refit with `--fittiers --gaptarget` (the war's collector-gap
    fit), or with elite pressure from these seasons (`--pressure`).
- **Elements are unstable season to season.** All five were present in two
  of three seasons (max 6 and 8), then earth took 11 with air absent. Air's
  diagonal-only movement (colour-bound, like a bishop) is the likely weak
  point.
  - Next: let Air also step 1 orthogonally, or give it range 3, then refit
    the prices.
- **Boring bits.**
  - Braces are 38–48% of orders. They are the "nothing better to do" order:
    the bot spends a spare order bracing an idle threatened unit.
  - Unit move abilities are about 1% of orders.
  - Water's river run is almost never used.
  - Surround capture is inert.
- **Many changes from the brief** (the table below), each measured in the
  log above.
- **5×5 uses the 7×7 numbers.** Per-size presets (HQ reach 1 on 5×5) need
  the size's config stored in the state.

## Deviations from the brief (rules v0), and why

| Brief | Built | Why |
|---|---|---|
| HQ health about 20 | 12 | at 20 with the rest of v1, 57% of games reached the limit |
| Units next to their own HQ +1 health | off (`hqAura` 0) | walls next to the HQ stalled every game: +18 points of limit games |
| HQ attacked from adjacent tiles | from up to 2 tiles (`hqReach` 2) | defenders wall the 3–5 adjacent tiles, which are also their deploy tiles; without this, 77% of games hit the limit |
| HQ healing (the duel's heals, Drain, the wood perk) | HQs cannot be healed (`hqHealShare` 0) | heals undid sieges |
| (none) | contested ground: no deploy next to an enemy | stops free re-plugging of a breached wall |
| (none) | at most 7 units a side | trench lines on a full board; also halves bot time |
| Income about 2 + nodes | 2, +1 every 2 of your turns, + nodes, +1 catch-up while behind on nodes | flat income gave decided early 65% and comebacks 24% |
| (none) | unit health ×1.5 | attackers survive HQ fire long enough to siege: 13% → 9% at the limit |
| About 12 turns each | 14 | 13% at the limit at 12; mean length 8.3 either way |
| Card prices: duel's, emerald cost mapped from tide | own refitted prices, same 0.6 emerald mapping | veterans 79–92% and two elements missing on duel prices |
| First player 2 orders on turn 1, second +1 emerald | as briefed | 49–54% first-player wins, in band without retuning |
