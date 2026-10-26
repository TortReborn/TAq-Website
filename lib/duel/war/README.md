# Three-Front War

A second ruleset for Tank Duels. It is played beside the card duel from the
same decks, lobby and match table, and reuses the card catalog, the deck and
fairness rules, the Tank abilities and the balance lab (`../lab.ts`:
`node scripts/duel-lab.mjs <cmd> --ruleset=war`).

## Server and client

- **Storage.** `duel_matches.ruleset` is 'duel' or 'war'; a war row's `state` is a
  WarState. `node scripts/duel-migrate-dev.mjs` adds the column to the local
  dev database, and refuses to run against any other host.
- **Store.** `../store.ts` handles both rulesets: practice and friendly,
  mulligan, plans and concede. A plan is stored in the state and kept secret
  until the round resolves.
  - Practice: the bot plans as soon as the player locks in, so every plan
    resolves a round in the same request.
  - Friendly: the round resolves when the second plan arrives. If the clock
    (`WAR_ROUND_SECONDS`, checked lazily like the duel's) runs out first,
    whoever has not locked in braces everything, and the miss counts toward
    the three-in-a-row forfeit.
- **API.** The same routes as the duel.
  - `POST /api/duels/matches` takes `ruleset: 'war'`.
  - The match payload carries `ruleset`, `warView`, `lockedIn` and
    `opponentLockedIn`.
  - The action route takes `{type: 'plan', plan}`, rebuilt field by field,
    then checked with `validatePlan`.
- **Client.** `client.ts` is the single browser-safe import. The planning
  helpers (`orderOptions`, `specSlots`, `validatePlan`, the costs) take a
  player's WarView directly, so the UI offers exactly what the server
  accepts. `warGuide()` returns the numbers a rules page needs.
- **Round log.** Events come in resolution order; `WarEvent` in `types.ts`
  lists them.
  - Attacks record their lane, the slot they were aimed at if a Guard
    pulled them elsewhere, and what they hit.
  - Damage records the health left and whether a brace halved it.
  - `resolved` closes each round.

## war-3.2: live games use the war prices

Until war-3.2, `balance-coefficients.json` here was read only by the lab:
live war games were built from the duel catalog, so players got the duel's
prices, not the measured ones. Now `cards.ts` (`warCard`, `warCards`)
builds every card from the war prices with the war versions of Her Majesty
and Syndra, the way Warfront does with its own file. `defOf` in the
engine and client reads it, so the battle screen, replay and guide show war
cards. Member cards still come in `extraDefs` at duel prices. The rules
are v3.1 unchanged; `WAR_RULES_VERSION` is war-3.2 because live cards
changed.
- War prices also add a cost-6 bucket for normal cards, so some normal
  cards cost more in war than in the duel. Deck rules do not look at cost,
  and the practice bot now builds its deck from `warCards()`.
- During a lab run `WAR_PRICES.live` reads the live catalog (the prices
  being fitted). A test checks that the lab's war catalog is exactly the one
  live games play.
- **Confirmation** (one season, seed 2026, live prices): decided early 48%,
  comebacks 46%, lead changes 1.05, veterans 63%, 10.3 rounds with 1.3% at
  the limit, starters 0.59 / 0.39, seat 0 50%, elite elements all present
  (max 7). Every number is inside the v3.1 bands below, as expected: the lab
  already played these prices.

## Rules v3.1 as built (after playtest)

Playtest feedback on v3: brace was "too much guesswork/luck ... super punishing", and
shifting that also attacked "seems very powerful". v3.1 (`WAR_RULES_VERSION` war-3.1)
changes exactly those two things and prices, and lightens Initiative:

| Rule | As a player reads it | Knobs |
|---|---|---|
| **Brace stance** | Brace: take half damage this round **and next**. From next round the stance is public: both players see a shield badge on the unit while planning. Switching out or shifting ends it. If it survives a hit it strikes back for **1**. | `braceStance: 'extend'`, `braceCounterFlat: 1`, `braceCounter: 0` |
| **Advance and strike, weakened** | A unit shifting into an empty slot can still attack from its new lane, but that attack lands **after every other action**, at **half power** (rounded down, at least 1). | `shiftAttack: 'empty'`, `shiftAttackTiming: 'last'`, `shiftAttackPower: 0.5` |
| **Initiative, lighter** | The side that has **lost more towers** wins speed ties and deploys first. Tower damage no longer counts, so it only starts once a tower falls. | `underdogInitiative: 'fallen'` |

- **Prices.** Refitted under the v3.1 rules with the same flags as before; every element's
  mono free deck sits at 46–51%. To go back to v3, set the v3 knobs and rerun the same
  `tune` command.
- **Unchanged from v3:** switch in braced, growing income, Retake, chip.
- **New knobs, not used:** `braceStance: 'next'` (a brace that only takes effect next round:
  no guess at all, but the bot almost never ordered it, 5% of orders, so it can't be
  measured fairly) and `initiativeMaxGap` (Initiative only while the tower gap is small;
  moved comebacks about 2 points).

### The brace luck read

`summarizeWar().braceLuck`. For every round a side ordered a brace, the lab replays that
round with those braces removed (unit idle instead), same seed and same opponent plan,
and plays both branches on through the next round's real plans. The swing is the lead
difference between the branches, from the bracer's side: what that brace decision was
worth. Luck shows up as a wide spread: many braces worth nothing (nobody attacked), a few
worth a whole lane.

| Elite games, 3 seasons each | v3 | **v3.1** |
|---|---|---|
| Mean swing (lead points) | 3.7–4.1 | 2.2–3.0 |
| Mean absolute swing | 4.3–4.7 | 2.8–3.6 |
| Spread (sd) of the swing | 7.1–7.3 | 4.9–6.1 |
| Braces worth nothing (< 0.5) | 38–41% | 31–35% |
| Braces that swing 5+ (a big guess won or lost) | 29–32% | 18–24% |
| Strike-back damage per game | 13.3–15.3 | 4.7–6.0 |

Random curve decks (`wprobe`, 4,000 games): mean |swing| 3.74 → 3.09, sd 6.20 → 5.24,
wasted 40 → 33%, big 26 → 20%, strike-back damage 12.8 → 5.0 a game.
A brace now decides less on a coin flip, is wasted less often, and punishes an attacker
for 1 instead of its whole power. It still matters (mean swing +2.2 to +3.0 in the
bracer's favour).

### v3.1 results

Six seasons (seeds 2026 and 7000, three each), same league settings as v3.

| | Target | v3 (6 seasons) | **v3.1 (6 seasons)** |
|---|---|---|---|
| Decided early | ≤ 45% | 39–45% | 38–48% (3 of 6 over) |
| Comebacks | 35–45% | 48–54% | 46–54% |
| Lead changes per game | 0.9–1.4 | 1.02–1.28 | **1.00–1.17** |
| Veteran vs free, top 5 | 58–68%, always > 55% | 62–69% | 59–75% (3 of 6 over 68; never under 55) |
| Plan search vs greedy (3,000 games) | ≥ 65% | 75.8% | 65.3% |
| Plan search vs random (1,200 games) | ≥ 95% | 99.3% | 99.7% |
| Distinct choices a round | ≥ 17 | 19.0–19.7 | 19.4–20.6 |
| Non-attack orders, tank included | ≥ 35% | 43–45% | 37–40% |
| ... counting a shift that attacks as an attack | | 32–34% | 32–36% |
| Order entropy (bits) | | 1.91–1.95 | 1.69–1.87 |
| Rounds; at the limit | 7–11; < 10% | 9.8–10.6; 1.7–4.5% | 10.0–10.7; 1.3–3.6% |
| Starters, best / worst | 40–60% | 0.56–0.68 / 0.40–0.45 | **0.57–0.59** / 0.38–0.46 |
| Elite elements (of 20) | all present, none > 8 | all present, max 8 | one absent in 2 of 6; max 9 once |
| Seat 0 wins | 47–53% | 48–52% | 49–52% |

- **Order mix (v3.1 elites, unit orders):** attack 67–72%, brace 13–15%, shift 7–9%,
  switch 5–7%, move 1–5%; the tank acts 0.25–0.32 times a round per side. 61–67% of
  shifts carry an attack (v3: 81–84%), and shifts fell from 14–18% of orders to 7–9%.
- **Units last longer:** 3.7–5.1 hits to knock one out (v3: 2.9–3.2), since a stance
  covers two rounds.
- **The skill guard dipped to the floor** (75.8% → 65.3% against greedy). The v3
  brace was a large, risky swing a good planner exploited; the calmer brace leaves less
  to out-read. Random play still loses 99.7%.

### Experiment log (v3.1)

Screens, random curve decks, v3 prices unless noted (early / comebacks / lead changes /
vs greedy / non-attack all/strict / luck |swing|, sd, big / strike-back damage a game):

| Change from v3 | Early | Cb | Lead ch. | vs greedy | Non-atk | Luck | Strike-back | Verdict |
|---|---|---|---|---|---|---|---|---|
| v3 | 44 | 50 | 1.14 | 76% | 47/36 | 3.73, 6.17, 26% | 12.8 | |
| A: no strike-back | 45 | 48 | 1.08 | 73% | 43/32 | 3.09, 5.54, 21% | 0 | |
| B: strike-back flat 1 | 45 | 48 | 1.11 | 75% | 44/34 | 3.45, 5.89, 23% | 4.0 | |
| B: strike-back half power | 44 | 50 | 1.11 | 75% | 45/35 | 3.54, 5.96, 24% | 7.2 | |
| C: stance 'extend' + A | 45 | 47 | 1.09 | 71% | 44/34 | 2.77, 5.08, 19% | 0 | |
| C: stance 'extend' + flat 1 | 45 | 48 | 1.11 | 74% | 46/36 | 3.13, 5.38, 21% | 4.7 | kept |
| C: stance 'next' + A | 46 | 47 | 1.07 | 73% | 42/30 | 0.20, 1.19, 1% | 0 | bot ignores it (brace 5%) |
| Shift attack off | 43 | 50 | 1.15 | 72% | 40/40 | | | length 11.3, 6.9% at limit |
| Shift attack last | 47 | 47 | 1.06 | 78% | 45/35 | | | shifts stay 14%: not weaker in use |
| Shift attack half power | 45 | 49 | 1.12 | 72% | 42/38 | | | |
| Shift attack last + half | 44 | 49 | 1.13 | 73% | 42/37 | | | kept |
| stance+A, shift off | 45 | 49 | 1.09 | **62%** | 37/37 | 2.87, 5.19, 19% | 0 | skill below 65 |
| stance+A, shift last+half | 45 | 48 | 1.07 | 67% | 39/35 | 2.88, 5.14, 19% | 0 | |
| stance+flat 1, shift off (L1) | 45 | 50 | 1.14 | 69% | 40/40 | 2.97, 5.11, 19% | 5.6 | league |
| stance+flat 1, shift last+half (L2) | 45 | 48 | 1.10 | 69% | 42/38 | 3.12, 5.30, 20% | 5.3 | league |
| L1 + Initiative gap cap 6 / 10 | 46 | 48 | 1.10–1.12 | 67–68% | 40/40 | | | trims 2 pts; dropped |
| L1, Initiative off | 50 | 44 | 1.02 | 66% | 40/40 | | | |

Leagues (three seasons each):

| Config | Early | Cb | Lead ch. | Veteran | Starters | Elements | vs greedy | Verdict |
|---|---|---|---|---|---|---|---|---|
| L1 (shift off), v3 prices | 39–44 | 50–54 | 1.15–1.22 | 63–72 | 0.60–0.69 / 0.38–0.42 | fire 12 once | 66.9% | choices 17.7–18.6 |
| L2 (last+half), v3 prices | 40–41 | 52–54 | 1.09–1.28 | 61–71 | 0.54–0.61 / 0.31–0.42 | fire 11 once | 68.4% | fire vet niche 0.83–0.90 |
| L2, refit prices | 42–50 | 45–49 | 0.99–1.15 | 65–80 | 0.60–0.67 / 0.36–0.39 | fire 9 once | | veteran 80 once |
| **L2 + Initiative 'fallen', refit (v3.1)** | 38–48 | 46–54 | 1.00–1.17 | 59–75 | 0.57–0.59 / 0.38–0.46 | max 9; one absent twice | 65.3% | **shipped** (6 seasons) |
| L2 + 'fallen', v3 prices | 42–44 | 45–50 | 0.96–1.16 | 60–79 | 0.57–0.60 / 0.40–0.44 | max 9 | 66.5% | veteran 79 once |
| strike-back half power + 'fallen', v3 prices | 37–42 | 50–57 | 1.15–1.27 | 60–68 | 0.55–0.59 / 0.35–0.45 | water 9 twice | 66.9% | 11 strike-back damage a game; 8.6% at limit once |

**Why these, in player terms.** Brace used to be a blind bet: guess right and the
attacker ate its own power back, guess wrong and you wasted the unit's turn. Now a brace
buys two rounds of cover, and the second round is out in the open, so the opponent
decides with the stance in view instead of guessing. The strike-back of 1 still makes
hitting a braced unit a little costly. Shifting is a move first: a shift into an open
slot can still take a swing, but it lands after everyone else has acted, at half
strength. Initiative now only helps a side that has actually lost a tower.

**Still off (v3.1).**
- Decided early is over 45% in 3 of 6 seasons (46–48), and comebacks run 46–54%, over
  their band. The v3 brace was a big swing source; calming it lost a few points of drama.
- Veterans over 68% in 3 of 6 seasons (70, 71, 75). The refit prices shift the evolved
  elites around.
- The skill guard sits at the floor (65.3%).
- Elements: one element absent from the elite 20 in 2 of 6 seasons, one at 9.

## Rules v3 as built

v3 (`WAR_RULES_VERSION` war-3) is v2.1 plus six rules. Each one is a knob in
`WAR`, and setting all six back gives v2.1. The results and the experiment log
are below.

| Rule | As a player reads it | Knob |
|---|---|---|
| **Brace strikes back** | A braced unit takes half damage. If it survives a hit, it hits the attacker back for its power. | `braceCounter: 1` |
| **Switch in braced** | A unit switching in from the garrison is braced that round. | `switchBrace: true` |
| **Advance and strike** | A unit shifting into an empty slot can still attack from its new lane. | `shiftAttack: 'empty'` |
| **Growing income** | 2 emeralds a round, +1 every 2 rounds (2, 2, 3, 3, 4, ...), bank cap 8. | `income: 2`, `incomeStep: 2` |
| **Retake** | Once a war, if you hold the front of a lane whose tower fell (your unit there, none opposite) at upkeep, the tower is rebuilt with 4 health. | `rebuild: 4`, `rebuildMax: 1` |
| **Initiative** | The side behind on towers (fewer standing, then less tower health) wins speed ties and deploys first. | `underdogInitiative: true` |

- **Prices.** War prices were refitted under the v3 rules with the v2 fit's
  flags (`tune --ruleset=war --fixstats --normaloffsets --elimit=2.5`).
  Under v3 the v2.1 prices left earth free decks at 41–42%. The refit has
  every element at 45–52%, and the tier bonus stays 0.
- **Card text** stays generated. `text.ts` has `warBraceText`,
  `warSwitchText`, `warShiftText`, `warIncomeText` and `warComebackText`
  (one line per comeback rule in force), and they read the knobs.
- **Events.** New: `counter` (a braced unit strikes back; a damage event
  follows), `rebuild`, and, from knobs that are off, `bounty` and `laststand`.
  The `income` event may carry `chest`.
- **The bot** offers "shift, then attack from the new lane" as a unit option
  whenever the rule allows it. Its brace prior counts the strike-back.
- **Lab stats.** `summarizeWar` adds `nonAttackShare` (tank orders counted as
  orders), `orderEntropy`, `ordersPerRound`, `shiftAttackShare`,
  `countersPerGame` and `rebuildsPerGame`. `wprobe` also prints when
  comebacks happen. The choices count now counts each attack a shift could
  carry.

### v3 results

Leagues are run as in "Results" below: 25 generations, 8 decks a niche, 16
games a deck, 1,000 traced elite games. v3 ran six seasons: seeds 2026 and
7000, three seasons each. v2.1 ran three seasons, re-measured with the new
stats (a rerun repeats the first to the digit). Lead numbers are per
exchange. A single season carries about ±5–10 points.

| | Target | v2.1 | **v3** |
|---|---|---|---|
| Decided early | ≤ 45% | 58–62% | **39–45%** |
| Comebacks | 35–45% | 30–37% | 48–54% (over) |
| Lead changes per game | 0.9–1.4 | 0.76–0.77 | **1.02–1.28** |
| Veteran vs free, top 5 | 58–68%, always > 55% | 72–76% | **62–69%** |
| Plan search vs its greedy plan (3,000 games) | ≥ 65% | 64.9% | **75.8%** |
| Plan search vs random plans (1,200 games) | ≥ 95% | 99.5% | 99.3% |
| Distinct choices a round | ≥ 17 | 18.1–18.2 | 19.0–19.7 |
| Non-attack orders, tank orders included | ≥ 35% | 29–30% | **43–45%** |
| Order entropy, tank orders included (bits) | | 1.50–1.55 | 1.91–1.95 |
| Rounds; at the limit | 7–11; < 10% | 9.0–9.2; 0.3–0.8% | 9.8–10.6; 1.7–4.5% |
| Starters, best / worst | 40–60% | 0.62–0.71 / 0.35–0.39 | 0.56–0.68 / 0.40–0.45 |
| Elite tank elements (of 20) | all present, none > 8 | one absent in 2 of 3 seasons | all present in 6 of 6; max 8 |
| Seat 0 wins | 47–53% | 48–52% | 48–52% |

- **Order mix (v3 elites, unit orders):** attack 62–65%, shift 14–18%,
  brace 12%, switch 6–7%, move 1–3%. The tank acts 0.24–0.28 times a round
  per side (v2.1: 0.16–0.18).
- **Shifts.** 81–84% of shifts carry an attack. Counting those as attacks,
  non-attack orders are about 30% with tank orders and about 23% without.
  Either way the mix is wider (entropy 1.9 bits against 1.5), because units
  now reposition.
- **Per game:** 4–5 strike-backs, 0.4–0.5 rebuilt towers, 2.9 towers fall
  (v2.1: 2.5), 3.0–4.0 hits to knock a unit out.
- **Comebacks are real.** On random decks, 83% of v3 comebacks had their
  5-point deficit after the first third of the game. The deepest deficit a
  winner came back from averaged 11.1 (a tower is worth 8 + its health).
  v2.1: 78%, 9.5.
- **Random curve decks** (`wprobe`, 4,000 games), v2.1 → v3:
  - decided early 65.5 → 43.7%;
  - comebacks 29.2 → 49.9%;
  - lead changes 0.69 → 1.13;
  - rounds 9.2 → 10.7, 4.4% at the limit;
  - non-attack 32 → 47%.

**Still off.**
- **Comebacks run 3–9 points over the band.** Across every configuration
  tried, decided early plus comebacks stayed at about 92–95 points. One
  metric falls only as the other rises, because both read the same lead
  trace over about 10 samples a game. v3 takes the user's first ask ("not
  decided early") and lets comebacks run a little high. The skill guard
  rose at the same time (75.8% against greedy), so the extra comebacks come
  from skill, not dice. Dropping Initiative (config Ft below) gives decided
  early 46–50% with comebacks 42–47%.
- **The best starter** went over 60% in 2 of 6 seasons (0.68, 0.61), and
  one veteran season reached 69%.

### Experiment log (v3)

Method: one change at a time as a `WAR` knob. The quick screen is `wprobe`
(3,000 random curve-deck games) plus `wversus` against greedy (1,200 games)
and against random (600). Each takes about a minute on 18 workers.
Survivors got three-season leagues. Probe numbers are random decks, so their
decided-early runs about 5 points above the elite leagues'.

Screens against v2.1 (probe: decided early 65, comebacks 29, lead changes
0.68, greedy 65%, non-attack 26% of unit orders):

| Change | Early | Comeback | Lead ch. | vs greedy | Non-atk | Rounds | Verdict |
|---|---|---|---|---|---|---|---|
| Brace strikes back, half power | 61 | 32 | 0.76 | 69% | 29% | 9.7 | kept, at full power |
| Brace strikes back, full power | 63 | 32 | 0.75 | 73% | 30% | 9.8 | **kept** |
| Switch in braced | 64 | 30 | 0.69 | 67% | 27% | 9.3 | **kept** (more switches, more skill) |
| Shift may always attack | 60 | 32 | 0.73 | 84% | 48% | 8.6 | dropped: 30% shifts, swap chains confuse; greedy collapses |
| War chest +1 / +2 per tower lost | 63–64 | 31–32 | 0.70–0.72 | 62–63% | 26% | 9.3 | dropped: small, and less skill |
| Bounty 3 on a tower falling (cap 8 / 20) | 63–64 | 31 | 0.70–0.71 | 65% | 27% | 9.3 | dropped: no effect |
| Rebuild 3 | 62 | 33 | 0.78 | 65% | 26% | 9.5 | kept (as 4, once) |
| Income +1 every 4 rounds | 61 | 33 | 0.76 | 64% | 27% | 9.4 | kept (as 2 +1/2) |
| Last stand +2 | 65 | 31 | 0.73 | 67% | 27% | 11.1 | dropped: longer, no gain |
| Bank cap 12 | 65 | 29 | 0.68 | 65% | 26% | 9.2 | dropped: no effect |

Combinations (A = strike-back half power + rebuild 4 x2 + income +1 every 3):

| Config | Early | Comeback | Lead ch. | vs greedy | Rounds; limit | Note |
|---|---|---|---|---|---|---|
| A | 53 | 41 | 0.96 | 66% | 10.2; 3.7% | |
| A + towers 8 | 54 | 44 | 1.08 | 67% | 12.8; 19.5% | too long |
| A, no chip | 43 | 52 | 1.24 | 66% | 15.5; 88.5% | games stop ending |
| A, perks off | 50 | 43 | 1.02 | 64% | 10.0; 1.5% | perks snowball, but they are the map's flavour |
| B = A with income 2, +1 every 2 | 48 | 46 | 1.04 | 62% | 10.8; 4.6% | slow opening |
| B, full strike-back | 46 | 47 | 1.10 | 68% | 11.0; 5.7% | |
| C = B, full strike-back, switch in braced | 47 | 46 | 1.08 | 70% | 11.2; 7.2% | |
| C, brace takes a third | 45 | 49 | 1.18 | 78% | 12.2; 14% | too long |
| D = that, towers 5 | 47 | 46 | 1.06 | 79% | 10.6; 6.0% | |
| C, rebuild once (E) | 47 | 46 | 1.07 | 69% | 11.2; 6.6% | same as x2, simpler |
| E, shift into empty may attack (F) | 48 | 44 | 1.03 | 76% | 10.5; 4.2% | shifts 4 → 15% |
| F, v3 prices | 49 | 45 | 1.01 | 75% | 10.5; 4.4% | |
| F, v3 prices, Initiative | 44 | 50 | 1.14 | 76% | 10.7; 4.3% | |
| F, v3 prices, Initiative, rebuild 2 | 45 | 48 | 1.12 | 75% | 10.6; 3.7% | |
| F, v3 prices, Initiative only on fewer towers | 46 | 47 | 1.07 | 77% | 10.6; 4.6% | |
| F, v3 prices, city perk 0 / strike-back 0.75 / income 1 | 46–48 | 45–46 | 1.00–1.04 | 74–75% | 10.4–11.1 | noise |

Leagues (three seasons each; early / comebacks / lead changes / veteran /
starters best–worst / most elite decks of one element):

| Config | Early | Comeback | Lead ch. | Veteran | Starters | Elements | Verdict |
|---|---|---|---|---|---|---|---|
| v2.1 | 58–62 | 30–37 | 0.76–0.77 | 72–76 | 0.62–0.71 / 0.35–0.39 | one absent twice | |
| D, v2.1 prices | 43–45 | 47–50 | 1.07–1.17 | **51–75** | 0.60 / 0.28–0.31 | earth 0–1, air 10 | dropped: veterans fell below 55 and earth vanished |
| C, v2.1 prices | 41–48 | 45–51 | 0.98–1.20 | 54–75 | 0.58–0.62 / 0.40–0.43 | earth 0–3 | non-attack only 28–29% of unit orders |
| F, v2.1 prices | 43–47 | 44–50 | 0.98–1.07 | 53–69 | 0.60–0.64 / 0.36–0.41 | fire 9–11 | prices needed a refit |
| **Ft**: F, v3 prices | 46–50 | 42–47 | 0.97–1.02 | 62–70 | 0.57–0.60 / 0.39–0.44 | max 8 | the fallback (no Initiative) |
| G1: Ft, Initiative, rebuild 2 | 36–44 | 50–56 | 1.01–1.19 | 58–67 | 0.58–0.66 / 0.32–0.44 | thunder absent once | comebacks too high |
| **G2 = v3**: Ft, Initiative | 39–43 | 49–54 | 1.09–1.19 | 62–64 | 0.56–0.68 / 0.40–0.42 | max 8 | **shipped** |
| H: Ft, Initiative on fewer towers, own refit | 41–46 | 48–53 | 1.05–1.14 | 56–78 | 0.53–0.64 / 0.35–0.41 | water 9 | no better, veterans unstable |
| v3, seeds 7000 | 39–45 | 48–51 | 1.02–1.28 | 63–69 | 0.58–0.61 / 0.42–0.45 | max 8 | confirms G2 |

**Next to try.**
- **A comeback ceiling.** Initiative could switch off once a side is two
  towers' worth behind, which would trim the deepest comebacks and keep the
  shallow ones.
- **Rarity as specialisation.** Rarer cards could gain a second move mode or
  Advance on any shift. Veterans already sit in band, so this is for flavour
  and variety more than the numbers.
- **Starter lists.** The best starter over 60% comes from evolution finding
  one strong free list per element (random free decks are 45–52%). Curating
  `starter-decks.json` by hand, or adding a starter-spread term to the
  price fit, would target it directly.

## Rules v2 as built

v2 (`WAR_RULES_VERSION` war-2) is v1 plus the following:

- **Guard is lane-local** (`guard: 'opposite'`): only the enemy unit in its
  own lane must attack it first. Before, a centre Guard stopped both enemy
  flanks.
- **Air rework:**
  - A unit attacking out of Stealth ignores Guard (`stealthStrike`).
  - A slot emptied by a bounce stays open this round, so attacks aimed at
    it from any lane hit its tower (`bounceOpens`).
  - Air's tank ability is **Gust**: return an enemy unit costing 3 or less
    to its owner's hand (`airTank`).
- **Round-limit judging:** at the limit, most towers destroyed wins, then
  most tower damage dealt (`limitJudge: 'damage'`).
- **Her Majesty and Syndra** have war versions (`signatures.ts`). Her
  Majesty gives +1 health to your other units and +1 power to one chosen
  unit. Syndra gives +1 power to one chosen unit. Under war prices no other
  signature went over budget.
- **War prices** (`balance-coefficients.json`) now carry:
  - a separate per-element offset for normal cards (`normalElementBudget`);
  - an element offset limit of ±2.5;
  - the power/health weights held at their v1 values while the rest was
    refitted (`tune --fixstats`). Otherwise the refit makes health ever
    cheaper, and units took 5–7 hits to fall.

Knobs added but off by default: `powerMult`, `earthTank: 'fortify'`,
`siege` overflow or both, `guard: 'reach'`.

v1 (`WAR_RULES_VERSION` war-1) changes five things from v0, each a knob
(the v0 value in brackets): unit health x1.5 [x1]; chip siege, a lane's tower
loses 1 whenever its defender takes attack damage [none]; per-card speed
[element speed]; towers 6 health and a 16-round limit [12, 20]; a unit
may attack in the same action as its move [move replaces attack]. War
prices (`balance-coefficients.json` here) have the tier bonus at half and
a cost-6 bucket of normals.

Every number is a knob in `WAR` (`config.ts`).

| | |
|---|---|
| Board | 3 lanes (left, centre, right). Each side: one active slot per lane, a public garrison of 2, a hand |
| Territories | 3 drawn per war from the real map (`territories.json`, reduced from `public/territories_verbose.json`); a city in the centre when the draw has one (always, so far) |
| Towers | one per lane per side, 6 health; destroyed stays destroyed |
| Win | destroy 2 enemy towers; at round 16, most towers destroyed, then most tower health, then a draw |
| Seats | no first player: rounds are simultaneous; both open with 5 cards and may mulligan |
| Upkeep | +3 emeralds (bank cap 8), draw 1 (from round 2), front perks, Regen |
| Plan | secret. Each active unit: **attack** a slot in reach, **move** (its ability, paid in emeralds), **brace**, **switch** with a garrison unit, or **shift** to an adjacent slot (swapping). Plus deploys (emeralds) into empty slots or the garrison, and at most one tank (HQ) order |
| Resolve | 1. switches, then shifts; 2. deploys (alternating sides from a coin flip), with on-play effects; 3. attacks, moves and the HQ order by speed: Rush first, then speed (per card: a quarter of cards fast 3, a quarter slow 1, the rest 2, rolled from the slug; element speed in v0), ties by a seeded coin |
| Reach (soft lanes) | a flank reaches the slot opposite and the centre; the centre reaches all three; Ranged reaches all |
| Targets | slots, resolved at action time. An empty slot is a miss, except the attacker's own opposite slot, where the attack hits that lane's tower |
| Combat | unit health is card health x1.5 (unit heals and health buffs too); damage is not scaled, so a unit takes 2-3 hits. Siege: whenever a lane's defender takes attack damage, that lane's tower loses 1 (chip; overflow and both are knobs). No retaliation. Brace: damage taken halved, rounded down. Guard: an attacker whose reach includes a visible enemy Guard must hit a Guard (checked at resolution; the nearest to the chosen slot). Stealth: cannot be targeted until it acts. Pierce: overflow hits the tower in the target's lane. Drain: heals your tower in the attacker's lane. Freeze: loses this round's action if it has not acted yet, otherwise next round's |
| Perks | whoever holds a lane's front (own unit there, enemy slot empty) at upkeep: city +1 emerald, ore +1 attack this round, crops heal that unit 2, fish draw 1, wood repair that tower 2 |
| Costs | emeralds = ceil(0.6 × tide cost), for cards, moves and the tank ability. A unit that uses its move may also attack in the same action |

Decisions and deviations from the brief:

- **Speed (v1) is per card and paid in health**: a fast unit has 2 less
  war health, a slow one 2 more (`speedHealth`). It is rolled from the
  slug inside the war rules rather than added as a catalog keyword, so the
  live duel cards do not change.
- **Moves attack too (v1).** With free attacks and no retaliation, a move
  that replaced the attack was almost never worth its emeralds: with the
  improved bot proposing them, and even at no emerald cost, moves stayed
  under 1% of orders. Letting the unit also attack made them 3–8%.
- **The garrison is public.** Every unit reaches it through a deploy or
  a switch both players watch resolve; hiding it would mean redacting log
  events for little real secrecy. The read is *when* a switch comes.
- **Deploys cannot act the round they arrive** (no order was given for
  them). Rush means "acts before normal speed", not "acts on arrival".
- **A deploy whose lane was taken by a shift** goes to the garrison if
  there is room, else stays in hand unpaid.
- **Empty decks just stop drawing**; the towers and the round limit are
  the clock, so there is no fatigue.
- **Territories** with no resources listed or all four resources equal
  have no single perk and are left out of the draw (414 of 727 remain;
  22 cities). Cities also give their resource perk.
- **Effect remapping** is the comment table at the top of `engine.ts`.

## The bot (`ai.ts`)

Each round, for each side:
- **Options per unit.** A short list of real options: its two best attacks, its move with its best
  affordable target (and an attack), a brace when enemies can reach it, a switch when a benched
  unit stands there better, a shift into an empty centre, and (v3) each shift carrying its best
  attack from the new lane when the rules allow it.
- **Candidates.** Up to 20 plans: the plan of best options; that plan with each alternative
  swapped in, one unit at a time; deploy variants (deploy the biggest cards into the most
  threatened empty lanes, or bank the emeralds); and softmax-sampled mixes.
- **Scoring.** Each candidate is scored against 6 opponent plans built the same way but
  without deploys, since the opponent's hand is hidden. Each pairing is simulated one round
  forward, on a copy with both decks and the opponent's hand removed.
- **Choosing.** Regret matching solves the matrix, and the bot samples its plan from the
  mixed strategy.

It is seeded from the game, so games replay exactly. `mode: 'greedy' | 'random'` are the
baselines (`node scripts/duel-lab.mjs wversus --ruleset=war`).

## Collector gap pass (v2.1, shipped prices)

The war prices now have **no tier bonus** (`tierBonus` all 0), so a rare
card is exactly as big as a normal of the same cost. v2 had half the duel
game's bonus. The rules are unchanged. Three seasons each, measured like v2:

| | v2 (half bonus) | **v2.1: bonus 0** | Bonus fitted to the gap | Bonus 0 + elite pressure | Stealth Strike off (v2 prices) |
|---|---|---|---|---|---|
| Veteran vs free, top 5 | 79–86% | **60–72%** | 68–74% | 72–74% | 88.5% (1 season) |
| Lead changes (per exchange) | 0.62–0.66 | **0.73–0.80** | 0.56–0.73 | 0.53–0.61 | 0.53 |
| Comebacks | 29–31% | 29–35% | 27–33% | 27–28% | 25% |
| Decided early | 61–63% | 58–61% | 60–66% | 64–67% | 68% |
| Starters (best / worst) | 0.57–0.69 / 0.34–0.45 | 0.63–0.69 / 0.31–0.39 | 0.53–0.61 / 0.38–0.47 | 0.61–0.67 / 0.32–0.45 | 0.60 / 0.34 |
| Elite elements (max of 20) | 8 | 7 | 8 | 10 | 9 |
| Rounds | 8.4–9.1 | 8.6–9.0 | 8.9–9.2 | 8.3–8.8 | 8.3 |

- **Bonus fitted to the gap.** The tuner fitted the bonus in the same rounds
  as the normal-card offsets (`tune --fittiers --gaptarget=0.4`). Random
  whole-pool decks already sit at an even 50% against free decks, so the
  evolved gap comes from optimised card choices. Aiming random decks at
  40% drove the bonus to −0.4 to −0.7 (rare cards smaller than normals) and
  did no better than a flat 0.
- **Elite pressure.** Prices were refitted with the elites' over-use of
  each mechanic added (`--pressure`). The gap was worse, and fire took
  10 of 20 elite decks. Not kept.
- **Stealth Strike.** Turning it off widened the gap to 88.5%, so it does
  not favour renowned air cards. It stays on.
- **Hard lanes on v2.1 prices** (2 seasons): veteran vs free 61–77%, lead
  changes 0.59–0.62, water 7–10 of 20 elite decks, thunder starter
  0.26–0.28. Still no better than soft lanes.
- **Starters.** Free cards are untouched by the tier bonus, so the starter
  spread (best 0.63–0.69, worst 0.31–0.39) is the same noise as v2's: which
  lists evolution happens to find. Random free decks stay at 48–53% per
  element.
- **Against the targets.**
  - Veteran vs free at most 65%: met in 1 of 3 seasons (60.5%; the others
    70% and 72%, mean 67.5%), down from 79–86%. The 58% goal is not met.
  - Like-for-like lead changes of at least 0.6: met (0.73–0.80, the best
    of any version).
  - Starters within 40–60%: not met, same as v2.

## Results

All numbers are from bot self-play. Leagues: 25 generations, 8 decks per
niche, 16 games a deck, 1,000 traced elite games a season. Bands are the
spread over three seasons, or two for the duel. The v2 controls ran one
season each, except hard lanes, which ran four. A single-season number
carries ±5–10 points.

**Like for like.** The lead is sampled once per full exchange (a duel round
is both players' turns; a war round is one round). The old duel metric
sampled after every player-turn, so it counted the ordinary back-and-forth
of alternating turns as lead changes.

| | Duel today | War v1 | War v2 (soft lanes, chip) | v2 hard lanes |
|---|---|---|---|---|
| Lead changes per exchange | **0.42–0.46** | 0.66–0.77 | **0.62–0.66** | 0.51–0.88 |
| Comebacks (per exchange) | **24–26%** | 29–35% | **29–31%** | 22–38% |
| Decided early (per exchange) | 62–63% | 57–63% | 61–63% | 54–71% |
| Lead changes, old metric (per player-turn) | 2.39–2.48 | = per exchange | = per exchange | = |
| Comebacks, old metric | 41–47% | | | |
| Choices per turn / round | 6.1–6.6 | 18–18.5 | 17.4–18.9 | 16.3–17.3 |
| Actions per turn / round | 2.65–2.73 | 3.1–3.2 | 3.1–3.25 | 3.3–3.4 |
| Length | 16.1–16.7 player-turns | 8.9–9.4 rounds | 8.4–9.1 rounds (~6 min), 0.1% at the limit | 9.2–10.7 rounds, 0.3–4% at the limit |
| Veteran vs free (top 5 each) | 68–77% | 58–73% | **79–86%** | 61–84% |
| Seat 0 wins | 50% | 46.5–52% | 49% | 50–53% |
| Elite tank elements (of 20) | earth 6–10, water 2–9, thunder 0–6, air 1–2, fire 1–3 | earth 7–10 | fire 2–8, earth 6–8, water 3–6, thunder 0–4, air 0–3; none over 40% | air 1–9, earth 4–8 |
| Starter averages (best / worst) | 0.68–0.69 / 0.25–0.39 | 0.80–0.85 / 0.27–0.29 | **0.57–0.69 / 0.34–0.45** | 0.60–0.69 / 0.30–0.33 |
| Most-played card | 40–50% | 30–50% | 35–45% | 35–50% |
| Hits to knock out (elite games) | – | 3.2–3.4 | 3.2–3.8 | 4.6–7.8 |

Free decks against each other (random mono-element all-normal decks,
2,000 games): v1 had earth 71%, air 29%. v2 has every element at 48–53%.
The evolved starters still spread wider (0.34–0.69), because evolution
finds each element's strongest free list.

War-only, v2 soft:
- Order mix: attack 74–77%, move 2.8–6.6% (with its attack), brace
  10–11%, switch 5–6%, shift 3–4%.
- Per round per side: about 0.95 deploys and 0.15–0.19 tank orders.
- Of all attacks: 37–40% cross lanes, 4–6% fizzle, 24% hit a unit that
  swapped in, and 3% hit a tower directly.
- 2.5 towers fall a game.
- The centre holder wins 69–73%, the side with more perks 72–74%.

Siege (v2 prices; chip is three seasons, the others one each):

| | Chip (v2) | Overflow, limit 12 | Overflow + chip, towers 8, limit 12 |
|---|---|---|---|
| Rounds; at the limit | 8.4–9.1; 0.1% | 11.8; **90%** | 9.5; 10% |
| Lead changes / comebacks | 0.62–0.66 / 29–31% | 0.68 / 34% | 0.68 / 30% |
| Decided early | 61–63% | 62.5% | 66% |
| Veteran vs free | 79–86% | 67% | 71% |
| Elite decks | none over 40% | earth 11 | earth 10 |

- **Overflow** almost never ends a game on towers: 90% of games reach the
  limit. Those games are judged on towers destroyed and then damage dealt.
  That result follows the tower lead by construction, but it is a points
  win, not a capture.
- **Chip** stays the default: games end on captures and no element runs
  away.

Controls (one season each):
- **Air rework off:** the air starter averaged 0.39 and air made 2 elite
  decks. With the rework on it was 0.34–0.47 and 0–3. The effect is within
  noise.
- **Guard 'reach':** the fire starter reached 0.76, veteran vs free 77%,
  lead changes 0.61. Lane-local Guard is the better of the two.

**The bot** (v2 rules): the full plan search beats its own greedy plan 68%
and random legal plans 99.6% (1,200 games each), at about 300 games a
second on 18 workers.

**What the numbers say.**
- **Like-for-like engagement: war beats the duel.** More lead changes
  (0.62–0.66 vs 0.42–0.46) and more comebacks (29–31% vs 24–26%), the
  same share decided early, games 40% shorter, and about three times the
  choices.
- **Starters: the free cards balance, the best lists don't.** At the card
  level all elements now sit at 48–53%. The evolved starters still cross
  60% in one season of three (earth 0.69); the other two peak at 0.57 and
  0.59. The duel game has the same problem (0.68–0.69).
- **Veteran gap regressed:** 79–86% vs v1's 58–73% and the duel's 68–77%.
  Likely causes: the normal-card offsets (earth and water normals got
  cheaper bodies) and Stealth ignoring Guard, which helps renowned air
  cards most. Next: rarity bonus at 0; or fit the normal offsets and the
  collection gap in the same tuning run (meta.ts pressure).
- **Hard lanes** varies more from season to season than soft lanes, and is
  no better on average.

