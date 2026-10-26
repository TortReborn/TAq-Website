# Tank Duels: card battles on the website

Members battle each other, or a practice bot, with the cards they reel in the
Discord bot (`/reel`, `/tank`). The page is at `/duels`.

There are three rulesets on the same cards, decks and match table: this
card duel, Three-Front War (`war/README.md`, simultaneous rounds on three
lanes) and Warfront (`grid/README.md`, alternating turns on a 7x7 or 5x5
board with nodes and HQs).

The game is turn-based and runs entirely on the server. It needs no realtime
infrastructure: clients poll a version number, which fits Vercel.

## Goals

- Every card the bot can roll is playable. That is 566 Wynncraft NPCs and
  bosses, plus member cards. A median collection is about 40 distinct cards,
  mostly normal to rare, so a hand-picked battle set would leave most members
  with nothing to play.
- Rarity buys variety, not power. A mythic is more interesting than a normal
  of the same cost, not bigger.
- Several distinct playstyles, taken from the three games we modelled on:
  - Hearthstone/Magic style board combat with a mana curve.
  - Pokémon TCG style "moves": repeatable unit abilities that cost resource
    and replace the unit's attack.
  - Magic style element identity (colour pie).
- New members can play on day one.

## Rules

| | |
|---|---|
| Deck | 20 cards |
| Tank (hero) | 20 health; reduce the enemy tank to 0 |
| Tide (mana) | +1 max per turn up to 10, refills each turn |
| Board | up to 5 units per side |
| Opening | first player: 3 cards and skips the turn-1 draw; second player: 4 cards and the **Pearl** (+1 tide, once) |
| Mulligan | each player may send back any opening cards once |
| Actions | play units; each unit acts once a turn by attacking or using its **move** (costs tide); no acting on the turn it arrives unless it has Rush; once a turn, the **Tank ability** (below) |
| Combat | simultaneous damage; Guard units must be attacked first |
| Clock | 90 s a turn and 45 s for the mulligan in friendly duels; 3 missed turns in a row forfeits; practice has no clock |
| Limits | hand 8 (extra draws burn); empty deck deals growing fatigue damage; turn 50 ends the game on tank health |

**Keywords:** Guard, Rush, Ranged (no retaliation), Stealth, Shield,
Drain, Pierce, Regen. The rules text on every card is generated from its
data (`lib/duel/text.ts`), so it cannot drift from the engine.

**The Tank ability.** Each deck fights from a tank of its main element
(most cards, then most total cost; `tankElement` in `rules.ts`). Once a
turn the tank can act for 2 tide:

| Tank | Ability |
|---|---|
| Fire | **Flare**: 1 damage to an enemy unit or tank |
| Thunder | **Spark**: summon a 1/1 Spark with Rush |
| Water | **Mend**: restore 2 health to a friendly unit or your tank |
| Earth | **Raise Wall**: summon a 0/2 Stone Wall with Guard |
| Air | **Scout**: draw a card |

It is the game's tide sink. Before it, a turn with no good play had no
decision in it, spare tide was simply lost, and games were won by the
cheapest efficient bodies: evolved decks put a third of their slots in
1-drops. It also gives every element a plan on day one, whatever a player
owns.

**Elements are identity, not a damage wheel.** Each element has a stat
shape and an ability pool:

| Element | Style |
|---|---|
| Fire | burn and hard hitters |
| Thunder | rush, chain lightning, team buffs |
| Water | freeze, heal, draw |
| Earth | guard, shield, walls |
| Air | stealth, bounce, card flow |

An earlier version had an earth > thunder > water > fire > air > earth
+1-damage wheel. It produced 80/20 mono-element matchups in simulation,
decided before a card was played, so it was removed.

## Fairness

1. **Same budget per cost.** A card of cost *c* gets `2c + 1` stat points
   (`budget` in `balance-coefficients.json`; the curve is a lab knob).
   Power, health, keywords and abilities are all priced in those points. Rarer cards spend points on abilities, so their
   bodies are smaller.
2. **A small complexity premium.**
   - Rarer tiers get extra points: unique +0.5, rare +0.75, legendary and
     above +1.
   - It was added when the greedy bot misplayed abilities and a mythic was a
     trap. With the plan-search bot it looks too generous: see "Meta health"
     below, where veterans beat free decks far more than the target.
3. **Deck limits.**
   - At most 4 renowned cards (legendary, fabled, mythic, member), one copy
     each, and at most 1 mythic.
   - Other cards: up to 2 copies.
4. **Normals are free.** Anyone may run 2 copies of any normal card. There
   are five free starter decks, one per element.
   - Friendly duels need unique and rarer cards to be in your
     `card_collection`.
   - Practice allows any card.
5. **Fusion stars are cosmetic in duels.** Otherwise grinding duplicates
   would buy power.

## How the cards are built

The bot's cards have a name, art and a tier, nothing else. The catalog
(`lib/duel/catalog.ts`) derives everything else deterministically from the
slug. The same slug gives the same card on every server and in every browser.

- **Element:** a hand-written signature, then `ELEMENT_OVERRIDES`, then
  name keywords (e.g. "captain" gives water, "dogun" gives earth), then a
  slug hash.
- **Cost:** a tier-specific spread. Altar bosses use their level; dungeon and
  raid bosses cost at least 4.
- **Kit:** keywords and abilities drawn from the element's pool, as many as
  the tier template allows.
- **Stats:** solved so the whole card lands on its budget, leaning toward
  the element's power/health shape.

`lib/duel/signatures.ts` hand-writes about 30 cards: the raid pantheon,
Fruman crown and resistance, dungeon keepers and others. A signature fixes a
card's kit, but its stats still come from the same budget solver.

The card list is vendored from the bot. Run
`node scripts/sync-duel-cards.mjs` after the bot's `data/cards.json`
changes; `--check` reports drift.

## Balance method

Every number below comes from bot self-play, so it is a proxy: it measures
what this bot does with the cards, not what people will. Real match data
should replace it as the balance source once there is enough.

**Prices.** `balance-coefficients.json` holds the budget curve
(`budget`: base + perCost·c + quad·c²), the tier bonus, the normal tier's
cost spread and a price for every keyword and effect, plus `vanilla`, a
surcharge on cards with no keyword or ability (evolved decks were full of
plain bodies). The tuner (`tune.ts`) plays random legal decks, finds the
price keys whose cards win more than average, makes them dearer, and
repeats, keeping the most even round.

**The bot** (`ai.ts`) has a greedy layer and a plan search on top: it takes
its five best first actions, finishes each turn greedily, lets the
opponent's board swing back (their units and tank, with no hand or deck,
which the bot cannot see) and keeps the best plan. Width 3 beats the old
greedy bot 65% over 2,000 games; width 5 beats width 3 54%. The evaluation
weights (`ai-weights.json`) were put through a (1+1) evolution strategy
with paired seeds (`train.ts`): 100 challengers found nothing better than
the hand-set weights, so the search, not the weights, was the bot's
weakness. The lab runs width 3 for speed; the practice bot runs width 5.

**The lab** (`node scripts/duel-lab.mjs <command>`, on every core; flags at
the top of `lab-cli.ts`):

- `season` evolves a league (`evolve.ts`, `meta.ts`): one niche per tank
  element for free all-normal mono-element decks and one for veteran decks
  (any card), all playing each other. Niches stop the league collapsing onto
  one element. The best free deck of each element is that element's starter
  (`starter-decks.json`, read by `starterDecks()`, with the rule-built deck
  as the fallback).
- `meta` is the outer loop: set the structure (budget curve, tier bonus,
  tank health, opening hands, Tank costs), refit the prices with extra
  pressure on mechanics the last season's elites overused, run a season,
  score its health, then change the structure aimed at the worst-missed
  target, never retrying one already scored, and keep the best.
- `tune`, `train`, `versus` (bot width A against B), `peek`.

Serial opt-in vitest entries remain: `DUEL_TUNE=1` (tune.test.ts),
`DUEL_EVOLVE=1` (evolve.test.ts), `DUEL_SIM=1` (sim.test.ts).

**Engagement proxies** (`metrics.ts`, from traced self-play): length in
player-turns; legal non-pass actions per decision; distinct things to do at
the start of a turn; actions taken per turn; lead changes (lead = tank
health difference plus half the board-stat difference, with a dead band);
comeback rate (the winner was behind by 5 or more); "decided early" (the
winner was never behind after the first third of the game). `perExchange` repeats the lead-based numbers sampled once per full exchange (a duel round of both turns, or a war round), which is how the two rulesets compare like for like: on that basis today's duel has 0.42–0.46 lead changes a game and 24–26% comebacks (war/README.md).

Before and after the Tank ability, both with the plan-search bot, 2,000
games each; elite decks from a season / random curve-built decks:

| | Before (no Tank, 3/5 opening) | After (shipped) |
|---|---|---|
| Length (player-turns, mean) | 14.9 / 14.7 | 15.8 / 15.4 |
| Legal actions per decision | 5.8 / 4.3 | 5.0 / 5.1 |
| Distinct choices per turn | 6.1 / 5.2 | 6.4 / 6.0 |
| Actions per turn | 2.7 / 2.2 | 2.8 / 2.4 |
| Lead changes per game | 2.5 / 1.5 | 2.2 / 1.8 |
| Comeback rate | 45% / 29% | 38% / 35% |
| Decided early | 33% / 53% | 38% / 43% |
| First player wins | 35% / 42% | 53% / 55% |

The Tank ability clearly helps random decks and barely moves elite ones;
within season-to-season noise the elite column is flat. It is an
improvement, not a new game.

**Meta health** on the shipped rules (one season; the same structure gave
66–89% on the first row across three seasons, so read these as ±10 points):

| Target | Result |
|---|---|
| Veteran vs free decks (top 5 each), at most ~58% | **83%** (miss) |
| Every element among the 20 elite decks, none over 40% | earth 8, air 7, thunder 4, water 1, fire 0 (miss) |
| Veteran elite average cost in a midrange band | 3.15; slots by cost 1: 19%, 2: 30%, 3: 20%, 4: 14%, 5: 10%, 6+: 9% |
| No card in over half the elite decks | top card 35% |
| Starters within 40–60% of each other | 18–82% (miss: earth strong, water weak) |
| First player 47–53% | 53% |

**What the misses say.** The stronger bot shows a far bigger collection gap
than the greedy one did (58%). Two structural causes are likely: the tier
bonus (+0.5 to +1 point a card), added because the greedy bot misplayed
abilities, and normals stopping at cost 5, so a free deck has no late game.
One season with the tier bonus at 75% measured 69%. Both are knobs in the
JSON (`tierBonus`, `normalCostWeights`) for the next sweep.

**When you change rules or cards:**

1. Bump `RULES_VERSION` in `engine.ts`.
2. `node scripts/duel-lab.mjs versus` if the bot's search changed.
3. `node scripts/duel-lab.mjs meta --width=3 --write` (about 4 minutes an
   iteration on 20 cores).
4. Read the JSON diff and update the numbers above.

## Architecture

```
data/duel/cards.json          vendored card list (scripts/sync-duel-cards.mjs)
lib/duel/
  types.ts                    plain-data types; a GameState round-trips JSON
  engine.ts                   pure rules: applyAction(state, side, action)
  catalog.ts, signatures.ts   card generation
  balance.ts, balance-coefficients.json
  deck.ts                     deck rules, starter decks
  view.ts                     per-player redaction
  rules.ts                    rule constants, Tank abilities, clocks
  ai.ts, ai-weights.json      practice bot (greedy + plan search)
  store.ts                    Postgres persistence, lobby
  http.ts                     route helpers
  sim.ts                      bot-vs-bot games, traced for metrics
  metrics.ts                  engagement proxies
  lab.ts, lab-cli.ts          balance lab plumbing (scripts/duel-lab.mjs)
  tune.ts, evolve.ts, train.ts, meta.ts
                              price tuner, deck league, bot trainer, meta loop
  starter-decks.json          evolved starter decks
war/, grid/                  Three-Front War and Warfront (each with its own README)
app/api/duels/                lobby, decks, matches, action, accept, cancel
app/duels/                    lobby page, battle page
components/duel/              CardFace, Battle, DeckBuilder, duel.module.css
sql/create_card_duels.sql     duel_decks, duel_matches
```

- **The server owns the state.** `duel_matches.state` holds the full
  GameState: both decks in order, both hands, and the RNG. Players only
  ever receive `viewFor(state, seat)`, so there is nothing to cheat with
  client-side.
- **Version-locked actions.** Every write bumps `version`. Actions carry
  the version the client saw and run under `SELECT ... FOR UPDATE`, so stale
  or doubled actions get a 409 instead of being applied twice.
- **Polling.**
  - `GET /api/duels/matches/:id?v=N` answers `{ unchanged }` from one
    indexed read.
  - Clients poll every 2 s while waiting and every 10 s on their own turn.
  - The poll checks the session cookie only; the member check runs on
    actions.
- **Lazy clocks.** No cron job. The next request that sees a passed
  deadline applies one timeout per missed deadline.
- **Practice.** The bot answers inside the same request.

The website only **reads** the bot's `card_collection` and `card_members`.
Duels never change a collection.

## Rollout

1. Run `sql/create_card_duels.sql` on prod. It is additive: two new tables,
   and it touches nothing of the bot's.
2. Deploy the website.

No bot change is needed.

## Not in v1 (candidates)

- Rewards: pearls for wins, capped daily. This would write to the bot's
  `card_wallet`, so it needs a design pass with the bot side.
- A ranked ladder with Elo, and seasons.
- A bot DM or card-channel ping when a member is challenged; today the lobby
  refreshes every 10 s.
- Themed element assignment for more cards. Only 71 of the 566 have a
  curated element; the other 87% come from name hints or a hash.
- Set synergies, such as Fruman Resistance cards buffing each other.
- A websocket service on Railway, if polling ever proves too slow.
