# Chronicle research notes — the attested alliance record, 2020–2026

Compiled 2026-09-02 from four targeted web-research passes (forum crawl, web archives,
guild-software repositories, video record) plus territory_exchanges analysis. Standard:
**only named alliances with a written, dated source count as attested.** Map-data
inference is labeled as such and is never sufficient for an alliance roster on its own.

---

## 1. Attested alliances (name + roster + date + source)

### Hestia — community (non-war) alliance, ~mid-2020 → 2021+
- **Dec 2, 2020** (Pally, megalist thread p1, via Wayback snapshots 20210704/20211128/20220517
  of forums thread 278112): "ANO is apart of the alliances **Hestia** (a community alliance
  between ANO, ESI, LXA, and PUN) and Artemis (war alliance)".
- **Jun 6, 2021** (Pally, megalist p7): Hestia = Titans Valor [ANO], Emorians [ERN],
  Lux Nova [LXA], Empire of Sindria [ESI], Paladins United [PUN], HackForums [Hax];
  described as ~1 year old → formed ~mid-2020.
- End: undocumented (presumably absorbed into the Valhalla era).
- NOT currently in the chronicle. Candidate new entry (label as community alliance).

### Artemis — war alliance (already in chronicle; 2020 roster needs correction)
- Founding (Timeline doc, in chronicle): 30 Oct 2019 by Imperial, Paladins United, Caeruleum Order.
- **Dec 2, 2020** (same source as above): Artemis is the war alliance "made up of all the
  current massive land holding guilds on the map"; **Titans Valor [ANO] is a member**.
- **Dec 18, 2020** (Sheepn, thread 279337): ongoing conflict between Artemis
  (**includes Kingdom Foxes**) and an unnamed opposing coalition (see Goose below).
- **Feb 20, 2021** (99loulou999, thread 286375): "Artemis guilds warring the Rays-held desert."
- ⚠ CONTRADICTION with current chronicle entry: by Dec 2020, **Paladins United and
  Imperial appear on the ANTI-Artemis side** (see Goose), while ANO and Fox appear
  IN Artemis. Our prod entry keeps Imp/PUN as members until 11 May 2021 and never
  includes ANO/Fox. Artemis's roster evidently transformed during 2020; the exact
  join/leave dates are undocumented.

### Goose — war coalition opposing Artemis (in chronicle as map-inferred; now partially attested)
- **Dec 18, 2020** (Sheepn, thread 279337) — the anti-Artemis coalition (not yet named
  in the post): DXI, Eden, Avicia, HICH, Bovemists, Lily Pad, Ultra Violet, Emorians,
  TNI, **Paladins United, Imperial**.
- **Jan 19, 2021** (99loulou999, megalist p4): "TNR (TNI and TNA) are part of **Goose**" —
  the earliest recorded use of the name.
- ⚠ Our prod Goose entry (entirely map-inferred) includes ANO, Kingdom Foxes, ESI,
  HackForums, Lux Nova — contradicted or unsupported by the written record (ANO/Fox
  attested in Artemis; ESI/LXA attested only in Hestia, war side unknown). It also
  omits attested members Paladins United, Imperial, Ultra Violet, TNI/TNA, DXI, HICH,
  Bovemists, Lily Pad. Needs a rework against the attested roster.
- Why the map inference failed here: it seeded the "Artemis side" from the doc's stale
  2019 founding roster. Lesson recorded — bloc inference is only as good as its anchor.

### Valkyrie — Kingdom Foxes' long-running alliance brand
- 2016 thread (147790): Valkyrie Alliance = Kingdom of Foxes + Imperial.
- **May 25, 2021** (Dream, megalist p7): "Valkyrie stayed the same" while the two major
  alliances renamed — so Valkyrie still existed through the 2021 realignment.
- No 2020s roster ever published. Not chronicle-ready beyond a note.

### Niflheim — community alliance (in chronicle as 1-guild stub; roster now attested)
- **Jul 7, 2021** (HungHung, megalist p8 post #146): "Niflheim community alliance" =
  Avicia [AVO], Blue Nations United [IBT], ShadowFall [Shy], TheNoLifes [TNL].
- Note: [IBT] appears as "Blue Nations United" here; our DB guild name is "IceBlue Team"
  (same prefix). Verify the guild_prefixes spelling before adding a membership row.
- Chronicle upgrade candidate: add AVO, IBT, TNL alongside the existing Shy row
  (joins "by 2021-07-07"), keep the 2021-12-18 documented dissolution.

### Valhalla and Khaos — renames of the two major blocs, spring 2021 (corroborated)
- **May 25, 2021** (Dream, megalist p7): "the two major alliances both disbanded and got
  new names… Valhalla and Kaos (Khaos?)". Independently corroborates the Timeline doc's
  11 May 2021 Great Collapse. No public rosters were ever posted (the doc's rosters,
  already imported, remain the best source).
- **Sep 25, 2021** (IamFye, thread 295680): Valhalla described as the dominant mega
  alliance ("the meta of being top 10 on the guild sr leaderboard is to join valhalla").

### Khaos — dissolution bound (chronicle placeholder can be tightened)
- No formal dissolution record exists anywhere public.
- Bound: still at war in Jan 2022 (map: 500-800 quiet exchanges/week vs ex-Valhalla
  guilds, fading Feb→mid-Jul 2022 to zero) and **defunct by Jun 26, 2022** (the
  Cucumber Company post explicitly replaces the old alliance listing as "incorrect").
- Chronicle action: replace the 2022-03-31 placeholder end with ~2022-06-26
  ("defunct by" bound) or keep a mid-range approximation with this note.

### Cucumber Company — the 2022 mega-bloc (new, attested)
- **Jun 26, 2022** (TherapueticLiz — an SDU member — megalist p8 post #160), 14 members:
  Aequitas [Aeq], Titans Valor [ANO], Avicia [AVO], Blacklisted [BLA], KongoBoys [DUDE],
  Empire of Sindria [ESI], Gang of Fools [FOOL], Kingdom Foxes [Fox], The Clowns [MALD],
  Nefarious Ravens [NFR], Sins of Seedia [SDU], The Aquarium [TAq], Wynn Legacy [WNLY],
  Profession Heaven [PROF].
  Source: forums thread 278112 page 8. Single-source but member-authored; the alliance
  section was deleted Jul 7, 2022 (post #161, Sg_Voltage), making this the last public
  alliance roster ever posted.
- Corroboration: Titans Valor's Discord bot (github.com/titantimes/valor) consumed an
  alliance-claims feed built on Avicia's site code, commits Apr 23 – Dec 26, 2022 —
  ANO/AVO shared alliance infrastructure exactly in this window. Map data shows the
  same guilds as one FFA-trading bloc through 2022–2023.
- Formation: undocumented; between Jan and Jun 2022 (map: old Khaos war still running
  in Jan). Dissolution: undocumented; map shows the bloc fracturing across late
  2023 – Apr 2024 (Avicia–Sequoia war Oct–Nov 2023; Idiot Co–TAq war from Apr 29 2024).
- Membership caveats: Fox and FOOL are listed as members Jun 2022, yet map data shows
  both fighting bloc guilds in adjacent months (FOOL in H1 2022, Fox from H2 2022) —
  their stints were evidently short or ending; treat their rows cautiously.

### TheNoLifes + Aequitas — allied, 2023 (relationship, not a named alliance)
- **Sep 1, 2023** (kwiebs, Aequitas thread 280525 p22): "TNL and AEQ were allied and
  warring together." No alliance name, no other members named.

### In-game Diplomacy era — Wynncraft formalized alliances (by mid-2026)
- Sequoia's open-source mod added parsing for in-game "formed/revoked an alliance with"
  chat lines on **Jun 12, 2026** (commit 69fb472, SequoiaWynncraft/Sequoia-mod), with
  test fixtures quoting captured events:
  - "Sequoia formed an alliance with **Silk Road**"
  - "**Anime Lovers** revoked the alliance with Sequoia"
  - "GaztheCat [Sequoia's owner] revoked the alliance with **Chiefs Of Corkus**"
  - "Tannslee formed an alliance with **Radiant Roses**"
- **Jul 30, 2026** (commit 8b27368 + Modrinth 1.8.0 changelog): the mod began
  auto-snapshotting the in-game Diplomacy menu (up to 16 allies) to Sequoia's private
  backend — a growing machine-readable alliance archive, not publicly accessible.
- The official API (v3/guild) exposes NO alliance field (verified Sep 2, 2026).
- Chronicle implication: from ~mid-2026 the game itself records alliances; the four
  events above are the era's first attested alliance events.

---

## 2. Attested war events (new since the 2018-2021 import)

- **Artemis–Goose war**: "ongoing conflict" attested Dec 18, 2020 (thread 279337);
  "Artemis guilds warring the Rays-held desert" Feb 20, 2021 (thread 286375, active
  war guilds named: TNI, CXZ, ERN, PUN, Fox, Rays, ICo, PROF, Ghz, AVO, IBT, EDN,
  TerraLune). Already in chronicle as an event (map-dated from 2020-03-01).
- **The Long Raid** — week-long siege of Aequitas's Sky-province claim, late Jul /
  early Aug 2024. Video by Frank Wynncraft (youtube.com/watch?v=RLRh14ns6ok, premiered
  Aug 4, 2024), forum retelling posted Aug 9, 2024 by Defervesco (thread 318070).
  **Attacker never named in any indexed text.** Falls inside the map-attested
  Idiot Co–TAq war window but is described as small-guild warfare.
- **Eden coup** — "part of Eden when it was #1 and slightly after it got couped"
  (xK6TA, Titans Valor thread p97, Apr–May 2023). Internal politics, date fuzzy.

Map-attested wars (real, but belligerent BLOCS are inference — usable as events with
only the two principal guilds named):
- Avicia vs Sequoia: Oct 30 – Nov 20, 2023 (+ Jan 2024 round two)
- Idiot Co vs The Aquarium: Apr 29 – ~Jul 15, 2024 (+ Nov 2024 – Jan 2025)
- Aequitas vs Avicia: Nov 3 – Dec 21, 2025 (largest war in the dataset)
- KongoBoys vs Profession Heaven: from May 25, 2026 (ongoing; ends PROF's protected
  neutrality from Jan 2021)
- Aequitas vs Sequoia: from Aug 24, 2026 (ongoing as of this writing)

---

## 3. Explicitly unattested (do NOT enter as alliances)

- Any 2023–2026 bloc roster beyond the single TNL+AEQ statement. The 2024–25
  "Sequoia-side" and "Aequitas-side" groupings visible in exchange data have **no
  recorded names or rosters** — forum diplomacy moved to private Discords
  (attested: #guild-politics renamed #guild-community, Oct 2025 thread 322643;
  "real diplomacy happens in private alliance chats" — IceResistance, ANO founder).
- "Greater Valkyrie Alliance" (Oct 2022) — satirical thread only.
- "smtn elf, the greatest super-alliance of 2023" (Feb 2023 thread) — joke/garbled.

## 4. Unrecoverable / best remaining leads

- The megalist's alliance rosters lived in a Google Sheet never captured by any
  archive; the Valhalla/Khaos-era rosters are gone from the public web.
- Sequoia's backend (api.seqwawa.com) holds Diplomacy-menu alliance snapshots since
  Jul 30, 2026 — private; a Sequoia contact could export it.
- The 2022 ANO/AVO alliance-claims Google Sheet (macro id in titantimes/valor repo)
  may still exist though its endpoint now returns empty.
- Frank Wynncraft's other "Wynncraft Warring" episodes (channel UCTVz1eJ1xKEnlAITgsioL3g)
  — upload list unreachable to crawlers; a human with YouTube access could enumerate.
- Guild Discords: TAq's own, Sequoia (sequoia.ooo), Avicia, Aequitas, Idiot Co, and
  the official Discord's #guild-community channel.

## 5. Corrections owed to the prod chronicle (pending decision)

1. **Goose**: rework roster against the attested Dec 2020 coalition list (+TNR Jan 2021);
   remove or heavily-flag ANO/Fox/ESI/Hax/LXA rows; add PUN/Imp/UVs/TNI-TNA(+DXI, HICH,
   Bovemists, Lily Pad where guild_prefixes has them).
2. **Artemis**: reflect the 2020 transformation — ANO and Fox as members by Dec 2020
   (join dates unknown); PUN and Imperial departed at an unknown date before Dec 2020.
3. **Niflheim**: add AVO, IBT, TNL (by Jul 7, 2021).
4. **Hestia**: new community-alliance entry (~mid-2020 → unknown).
5. **Cucumber Company**: new entry, 14 attested members, joins "by 2022-06-26",
   end placeholder with fracture notes.
6. **Khaos**: tighten end to the Jun 26, 2022 "defunct by" bound.
7. Events: The Long Raid (2024); the four in-game Diplomacy alliance events (2026);
   optionally the map-attested wars above with only principal guilds named.

---

## Addendum (research round 2 — placeholder hunt, 2026-09-02)

New primary source: **Titan Times**, Titans Valor's newsletter (titansvalor.org/news,
mirrored at titantimes.github.io), vols 1-21 read, May 2022 - Nov 2025 (gap May 2023 -
Feb 2024). Key dated records: Cucumber Company formed for Season 5 (v1, 8 May 2022);
IceBlue Team founding member, left by 12 Jun 2022 (v3); Gang of Fools joined Jun 2022
(v3); "Cucumber was archived. The new alliance name is called 'Smtn else'" at the start
of Season 8, with FOOL's betrayal and PUN/ILQ/UTL joining (v6, 12 Oct 2022); busted
moments joined mid-season and Nefarious Ravens left "on account of the guild disbanding"
(v9, 25 Mar 2023 — NFR's last map exchange: 2023-03-09); Hestia "declining... still
around" with successor community alliance **Adonis** (ANO+ESI, v1; AVO joined by v3;
active through v13, Mar 2024).

smtn elf's death bracketed: last mention 10 Jun 2023 (Avicia Season-12 post, "thank you
for the hqs"); gone by the Season-13 post (19 Aug 2023), which thanks "The Aquarium -
our unwavering ally" — the Avocado era. No death announcement exists.

Wayback/thread sweep: PUN's OP listed "Valkyrie and Hestia, both community alliances"
Nov 2021 - Sep 2022 (Valkyrie thus attested 2015→2022 with Imp/Fox/PUN); ShadowFall
posted as an Artemis LEADER Mar 2020 and was "goose now" by 1 Feb 2021 (side-switch);
"BNU(IBT), SHY and TNL are all goose now" (1 Feb 2021); Goose 12-guild fanart roster
(Mar 30 + Apr 6, 2021) adds CNM, Aeq, WFN, Mag, TNL, GsW, CXZ; Goose was still unnamed
on Dec 18 2020 and named by Jan 19 2021. Empire of Nemract branded "ILQ + Aeu" from Nov
2020, active through Aug 2021 (Aeu resolves to 'Admiralia' today — tag-reuse risk, not
entered). Fringe names recorded: Wynnic Union (ILQ, Sep 2020), New Dawn, High-Class
Guilds. Oral history (Cameron, TAq veteran) fact-checked against map data: Mag/TNL
betrayal CONFIRMED, Avocado Aquarium + HQs subguild CONFIRMED (guild 'Avoquarium'
[HQs] created 9 Aug 2023), smtn-else-to-elf rename CONFIRMED, fuy's brief membership
CONFIRMED with corrected dates, Khaos-during-Vanir-only REFUTED.

The definitive change set (rev 2) lives in chronicle-draft-2020-2026-additions.json:
5 alliance edits, 6 new alliances, 1 event edit, 13 new events — dry-run clean.

---

## Addendum 3 — 2018-era round + pre-2018 territory data (2026-09-02)

2018 research applied to prod: Federation rebuilt from founder Drew1011's tribute
(thread 237070: 40 guilds, founded ~Feb 16 2018, died Nov 10 2018 3AM cascade);
Coalition end corrected to the Feb 16 Coa+WS merger; Aesir Pact added (thread 227373);
SOL added (name attested 3x; roster map-inferred: BYS/ASh/DDT/Oce/SPC/ECL); Terra's
Nov 2 2019 fall; events for the Federation's founding, the Feb 19 2018 Hax wipe
(111 territories to zero in <12h), and Terra's fall. Community guild-timeline image
(imgur seklYAQ, via thread 265297) recovered and read — key dates cross-checked.
Rename chains verified by abutting activity windows: LE Flowers->DiamondDeities,
DogsAmongUs->White Lotus, As Darkness Falls->Constellations.

Pre-2018 territory data verdict: exchange-level data DOES NOT EXIST anywhere public
(only archived territoryList capture: 2018-06-16). But Wayback holds guild-leaderboard
API captures WITH per-guild territory counts — see data/chronicle/pre2018-territory-snapshots.json:
Sep 23 2016 (Hax 146 of ~332; Libertas [Lir] 60 — a major 2016 power unknown to any
written source; UltimateXeons 53), Apr 16 2018 (all 15 holders = Federation guilds,
384 territories — independent confirmation of the tribute roster and rename dates),
plus 2019-2020 captures usable as validation against territory_exchanges. 2015-era
wynncraft.com/guild/ pages carry no territory counts. 2016-2017 war-event data
survives only as forum-thread imagery and written accounts.
