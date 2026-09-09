# NOT A PATCH — verification note for the territory-exchanges figures used by s1

Suggested destination: `data/wiki/research/analyses/canyon-of-the-lost-2018-2019.md`.
Settles the `figure-only-verifiable-in-dataset` findings on `the-canyon-concession`,
`the-federation-dies` and `iceblue-team` so nobody re-runs them.

## The territory set

Eighteen territories, defined as every distinct `territory` in `territory_exchanges`
matching `LIKE 'Canyon%'` with an exchange before 2019-06-01:

Canyon Dropoff, Canyon Entrance Waterfall, Canyon Fortress, Canyon High Path,
Canyon Lower South East, Canyon Mountain East, Canyon Mountain South,
Canyon Of The Lost, Canyon Path North Mid, Canyon Path North West,
Canyon Path South East, Canyon Path South West, Canyon Survivor,
Canyon Upper North West, Canyon Valley South, Canyon Walk Way,
Canyon Waterfall Mid North, Canyon Waterfall North.

("Canyon Walkway" first appears 2024-08-26 and is excluded.)

## Free-for-all position

`ffa-timeline.json` holds eight enumerated declarations (10 Mar, 24 Mar, 22 Apr,
10 May, 4 Jun, 6 Aug, 8 Sep, 12 Oct 2018). **None of the eighteen appears on any of
them.** The Canyon was never declared open ground at any point in 2018, so nothing
in these figures would be removed by a filter even if one applied.
`ffa-filter.mjs` refuses windows from 10 Nov 2018 and is right to; all figures below
are raw.

## Holdings reconstruction (holder = attacker on the last exchange before T, UTC)

| T (UTC) | Aesir guilds | Composition |
|---|---|---|
| 2018-11-11 08:00 | 17 | Fantasy 10, DiamondDeities 7, Kingdom Foxes 1 |
| 2018-12-01 00:00 | 17 | Sins of Seedia 10, IceBlue Team 7, Kingdom Foxes 1 |
| 2018-12-31 19:00 | 15 | IceBlue Team 15, Blacklisted 2, Kingdom Foxes 1 |
| 2018-12-31 20:00 | 13 | IceBlue Team 13, Blacklisted 4, Kingdom Foxes 1 |
| 2019-01-19 08:00 | 0 | Imperial 9, Blacklisted 7, Kingdom Foxes 1, BuildCraftia 1 |
| 2019-02-23 08:00 | 0 | Imperial 9, Blacklisted 4, BuildCraftia 4, Kingdom Foxes 1 |

Aesir guilds = Fantasy, Sins of Seedia, IceBlue Team, DiamondDeities, TheNoLifes.
At 00:00 UTC daily from 6 to 18 January 2019 the Aesir guilds hold one territory on
15 January and none on any other day. **Midnight snapshots of this region are noisy**
— it turned over constantly in December — so single instants should be quoted with
their timestamp, never as "in December".

## Exchange counts

| Window (UTC) | Total | By an Aesir guild |
|---|---|---|
| 10 Nov 2018 – 1 Jan 2019 | 1,626 | 712 |
| 16–31 Dec 2018 | 1,047 | 402 |
| 2–3 Jan 2019 | 109 | 0 |
| 2–18 Jan 2019 | 218 | 10 |
| 2 Jan – 28 Feb 2019 | 339 | 31 |

Heaviest single days: 20 Dec 138, 21 Dec 136, 29 Dec 161.

## The two exchange sequences that date the concession

Export clock is US Pacific and observes daylight saving; December 2018 and January
2019 are **UTC-08:00**.

31 December 2018, IceBlue Team → Blacklisted:

    18:54:22  Canyon Valley South
    18:59:58  Canyon Walk Way
    19:04:32  Canyon Mountain East
    19:18:44  Canyon Of The Lost

The negotiator reported Blacklisted's agreement at 08:42 export clock = 16:42 UTC,
and announced the ceasefire at 11:21 = 19:21 UTC — 2 min 16 s after the last of the four.

2 January 2019, Blacklisted → Imperial:

    11:16:22  Canyon Valley South
    11:26:40  Canyon Walk Way
    11:43:00  Canyon Mountain East

The council was told at 05:07 export clock = 13:07 UTC, 1 h 24 min later.
The fourth territory, Canyon Of The Lost, had gone Blacklisted → Sins of Seedia at
09:57:06 UTC on 1 January and back to Blacklisted at 19:16:09 UTC on 2 January.

## Winter gainers (for the-federation-dies)

Captures made, 11 Nov 2018 – 28 Feb 2019 UTC: Kingdom Foxes 11,738; Imperial 8,447;
DiamondDeities 6,916; TheNoLifes 5,784; HackForums 5,766. Net gain over the same
window is near zero for every guild (captures ≈ losses), so "top gainer" must mean
captures made; the article now says so.

## Log continuity

`check-log-gaps.mjs --min 3` reports no gap between 11 Nov 2018 and 28 Feb 2019.
Days with no Canyon exchange in January and February 2019 are real quiet days, not
the record stopping.
