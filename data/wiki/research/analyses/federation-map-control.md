# When did the Federation take the map? (territory-data analysis, 3 Sep 2026)

**Question.** The chronicle recorded the Coalition Civil War as ending "on 20 Mar 2018
when The Federation took control of the map". Drew1011's account puts the takeover at
about 20 February, with a roughly three-day reversal in March. The Federation tribute's
own figure — "8 months and 25 days" of map control, written in November 2018 — counts
back to mid-February and never matched a March start.

**Method.** Daily ownership was reconstructed from `territory_exchanges` (latest
exchange per territory at 12:00 UTC each day, 5 Feb – 10 Apr 2018) and each holder
scored against the chronicle's Federation roster, honouring per-guild join and leave
dates. Alliance Alliance's seven member guilds were scored the same way.

**Result.**

| Date | Federation | Alliance Alliance | Total | Fed share |
|---|---|---|---|---|
| 14 Feb | 0 | 241 | 372 | 0% |
| 17 Feb | 28 | 337 | 376 | 7% |
| 19 Feb | 134 | 187 | 379 | 35% |
| 20 Feb | 272 | 38 | 383 | 71% |
| **21 Feb** | **356** | 24 | 383 | **93%** |
| 26 Feb | 347 | 21 | 383 | 91% |
| 2 Mar | 164 | 157 | 383 | 43% |
| **3 Mar** | **43** | **308** | 383 | **11%** |
| 4 Mar | 114 | 236 | 383 | 30% |
| 6–18 Mar | ~300 | ~75 | 383 | ~78% |
| 19 Mar | 371 | 1 | 383 | 97% |
| **20 Mar** | **380** | 2 | 383 | **99%** |

**Findings.**

1. The Federation took the map on **21 February 2018**, holding 356 of 383 territories.
   This matches Drew1011's "about 20 February" and the tribute's 8-months-25-days figure.
2. The **2–4 March collapse is real and sharp** — down to 43 territories (11%) on 3 March,
   with Alliance Alliance back at 308. This independently confirms the tribute's "aside
   from ~3 days in March", a detail written from memory eight months later.
3. **19–20 March is a different event**: Alliance Alliance falls from 72 territories to
   one, and the Federation reaches 99%. That is the elimination of the opposing bloc and
   the true end of the war — not the moment the Federation took the map.

**Action taken.** The chronicle's dates were left unchanged (Alliance Alliance's stint
end and the war's end date are both correct at 19–20 March). Only the *description* was
relabelled, in dev and prod, with audit rows recorded. Articles were updated to state the
resolved sequence rather than an unresolved conflict between sources.

**Note on method.** This is a case where map data adjudicated between a participant's
memory and a curated record, and the participant was right about the substance while the
curated record had attached the right date to the wrong event.
