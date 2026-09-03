# Dossier — the Federation's own announcement channels, 2018

Research pass **2026-09-03**. Subject documents:

- `data/wiki/sources/docs/federation-alliance-announcements.md` — archive id
  **`federation-alliance-announcements`**, kind `discord-export`, tier **primary**, 631 lines,
  114 message headers, 79 archived image attachments.
- `data/wiki/sources/docs/federation-public-announcements.md` — archive id
  **`federation-public-announcements`**, kind `discord-export`, tier **primary**, 163 lines,
  23 message headers, 3 archived image attachments.

Cross-checked this pass against `drew1011-storytime`, `thread-237070` (the Federation tribute),
`thread-236962` ("R.i.p Fed"), the chronicle's 43 Federation membership stints, and the
`territory_exchanges` capture log (queried directly).

**Line numbers in this dossier are absolute file lines** (as `cat -n` gives, counting the 8-line
YAML front-matter). Note that `data/wiki/sources/federation/alignment.json` numbers the same
images **body-relative**, i.e. 8 lower. Convert before using it.

---

## 1. What the channels are, and their limits

### What they are

`#alliance-announcements` is the Federation's internal broadcast channel: the place where the
alliance's leadership told its member guilds what to do. It runs **17 Feb 2018 – 10 Dec 2018**.
`#public-announcements` is the same server's guest-facing channel and runs **19 Feb 2018 –
9 Mar 2021**, with its substance ending 13 Nov 2018.

These are **contemporaneous and official**. Every membership change, territory assignment, treaty
and war order is dated to the minute and posted by the people who made the decision. That places
them a full tier above `drew1011-storytime`, which is the same author writing 4–16 months later,
and above every forum thread we hold on 2018, all of which are retrospective.

### Who posts

In the alliance channel, of 114 message headers: **Drew1011 38**, **"Deleted User" ~26** (at least
four distinct, now-deleted accounts — the map poster of Mar–May, the Sins of Seedia leader, a Hall
of Fame poster, and others), **Viaire 19**, **Goden 8**, and single or double posts from Gas (3),
hot pink emperor (3), Arianna (2), FeodorRomanov (2), Wilfred (2), AurumKitsune, IceyDiamond,
Wynn, dwIcy, lego, mira, Milos, Slayne, faceman, Yoo Jin-ish, and one account whose display name
is a bare "●". The public channel is Drew1011 (9), Gas (5), jpresent (3), Arianna (2), Viaire (2),
plus three others.

The division of labour is visible: **Drew1011 announces membership and war policy; Viaire
publishes the maps and the free-for-all lists; Goden announces departures from July onwards.**
Drew1011's tribute later called Viaire "perhaps the best mapmaker the alliance had"
(thread-237070 post #1); the channel is what that credit refers to.

### The timestamps are US Pacific — established, not assumed

The export carries no timezone. It can be recovered from an internal check. On 4 May the Sins of
Seedia leader announced an event for "Sunday, May 6th, **11:00am CST/16:00 UTC**" (L178); on 6 May
at **8:32 AM** export time the same person wrote that it "begins in 30 minutes" (L189), putting
the event at ~09:02 export time against 16:00 UTC — **UTC−7, i.e. US Pacific daylight time**. A
second check agrees: the 20 Oct ceremony re-timed to "3:50 PM EST" (L585) was announced at 8:34 AM
export time that morning.

This matters twice over. (i) The **21 February territory division was posted at 9:12 PM Pacific,
which is 05:12 UTC on 22 February** — cite it by the channel's own date, but expect map data to
place it on the 22nd. (ii) It resolves the collapse timing: see §6.

### Limits as a source

1. **Announcement coverage is not uniform.** Between 21 Feb and 4 May 2018 the channel announces
   almost no membership changes — the single exception is Paladins United on 8 Mar (L48).
   Membership in that window is only inferable from the territory-assignment lists. From 4 May
   2018 onward joins and departures are announced routinely. Angelic [SKY] is a member for roughly
   seven weeks (chronicle: 15 Mar – 6 May) and is **named exactly once**, in the 22 Apr assignment
   (L122). Absence from this channel before May 2018 proves nothing.
2. **Assignments are prospective, not descriptive.** See §3: the lists say what a guild was told
   to hold, not what it held.
3. **It is the leadership's channel.** Disputes appear only after leadership resolved them, in
   leadership's words. Metric is announced as a spy (L488) with no evidence attached and no reply
   preserved. Ex Nihilo's departure is announced with the cause explicitly withheld (L468).
4. **79 images are unread.** All the actual maps are attachments. `alignment.json` maps them to
   line positions but is marked `"verified": false` throughout, and its own `$comment` warns that
   "an earlier corpus was mis-mapped this way." Nothing in this dossier depends on an image.
5. **Two of the most consequential announcements are by accounts we cannot identify** — the Aesir
   withdrawal (L623, `newdi5cordsnowblind62242414`) and the reaction-time rebuke (L348, "●").
6. **`#public-announcements` is thin.** Six of its 23 messages are Wynncraft staff relays, emoji
   notices or bot maintenance. Its value is concentrated in four posts: the application procedure
   (L95–102), two FFA lists, and the death announcement (L141–150).

---

## 2. Dated timeline

Dates as the channel gives them (US Pacific). "AC" = alliance channel, "PC" = public channel.

| Date | Ch. | Lines | What the channel establishes |
|---|---|---|---|
| 17 Feb 2018 | AC | L9–11 | First message. Guild leaders told to give their captains the captain role "so that they can discuss wars in the war channel" — a war-command structure exists on day one or two |
| 19 Feb 2018 | PC | L9–10 | First public message; the server already has a mass-tag spam problem |
| **21 Feb 2018, 9:12 PM** | AC | **L12–36** | **The guild-by-guild territory division: 22 guilds, regions, colours. "FFA TERRITORIES ARE IN BLACK"** — see §3 |
| 22 Feb 2018, 5:57 AM | AC | L37–40 | Three map images posted (unverified) |
| 2 Mar 2018 | AC | L41–42 | AurumKitsune: "Don't tag captains or leaders unless it's extremely important… There have been way too many unless [sic] tags" |
| **3 Mar 2018** | AC | L43–44 | **"We're actually doing a decent job of fighting back. If you can war, please log on and help fight back against them! We did this just two weeks ago, we can do it again"** — the March relapse, contemporaneously |
| 6 Mar 2018 | AC | L45–46 | The Discord is "semi public"; alliance business to be kept out of general |
| **8 Mar 2018** | AC | L47–48 | **"PUN has been accepted in to the Federation."** |
| 10 Mar 2018 | AC | L49–77 | Second full assignment, now with per-guild territory counts; 21 guilds; FFA list (12); a list of 7 "Available Territories for the Future" |
| 24 Mar 2018 | AC | L78–120 | Third assignment; 19 guilds; FFA list (21) |
| 22 Apr 2018 | AC | L121–160 | Fourth assignment; 17 guilds; FFA list (22) |
| 28 Apr 2018 | AC | L161–176 | The Divine Swords hosts a guild hide-and-seek across both provinces |
| 4–6 May 2018 | AC | L177–193 | Sins of Seedia's one-year anniversary event, Troms then WC7 |
| **4 May 2018, 8:59 PM** | AC | L185 | **"ANO has been kicked from the alliance, feel free to attack them."** |
| **4 May 2018, 9:07 PM** | AC | L187 | **"Also, TNL has joined the alliance."** |
| **8 May 2018** | AC | L195 | **"Lunatic [Mox] has joined the alliance."** |
| 10 May 2018 | AC | L196–240 | Fifth assignment; 19 guilds with counts, one at zero; FFA (23); "Go fetch now" |
| 4 Jun 2018 | AC | L241–268 | Sixth assignment, first posted by Viaire; 19 guilds, five at zero; FFA (21) |
| 8 Jun 2018 | AC | L270 | Hall of Fame award ceremony, invitation extended to the alliance |
| **13 Jun 2018** | AC | L273 | **"Titans Valor [ANO] has rejoined the Federation."** |
| 16, 21 Jun 2018 | AC | L274–287 | Map image drops only |
| **25 Jun 2018, 2:17 PM** | AC | L289 | **"PUN and Phx have left the alliance. Verinian Trials [ViT] has joined the alliance."** |
| 25 Jun 2018, 3:11 PM | AC | L290–296 | First use of the `@Guild Leader` / `@Captain` roles in place of the anonymised `@unknown-role` |
| 27, 29 Jun 2018 | AC | L297–302 | Tag discipline: the captain ping is "for when enemies are gaining ground rapidly and you desperately need allies"; mutes threatened for abuse |
| **30 Jun 2018** | AC | L304 | **"Ex Nihilo [Nih] has joined the alliance."** |
| 5–6 Jul 2018 | AC | L312–316 | Sins of Seedia award ceremony |
| **7 Jul 2018, 1:38 PM** | AC | L318 | **"We have made a treety with Snt. Let them hold tree island, and they will assist us whenever possible. Do not attack their tree island."** |
| **7 Jul 2018, 5:59 PM** | AC | L320 | **"Renegade [ReA] has joined Federation"** |
| 8 Jul 2018 | PC | L17–33 | Drew1011 relays the Wynncraft staff warning about the "Wynncraft Enhanced" modpack |
| 10 Jul 2018 | AC | L322 | Defence economics: "when defending DAU territories can you please use 1000 mobs?… so we don't burn as much money defending" |
| 13, 18 Jul 2018 | AC | L323–336 | Map drops, tagged `@Guild Leader @War` |
| 19 Jul 2018 | AC | L346–356 | The reaction-time rebuke, copied out of the leader chat: guilds "were tagged 3 times before anything was done" |
| **22 Jul 2018, 6:14 PM** | AC | L362 | **"Titans Valor [ANO] and Angels of Eternal [AoE] have left the Federation. Aphelion [Aph] has joined."** |
| 24–25 Jul 2018 | AC | L379–394 | Verinian Trials hosts a karaoke event for the alliance |
| **25 Jul 2018, 11:22 AM** | AC | **L397** | `@Alliance Member` — **"HoF and ViT are leaving and have partnered with CGoW, get ready to War"** |
| 25 Jul 2018, 5:23 PM | AC | L399 | "a personal thank you to everyone who warred today" — the counter-strike happened the same day |
| 27 Jul 2018 | PC | L34–45 | jpresent notes "an increase in negative attitutes between the guild communities" |
| 30 Jul 2018, 12:23 AM | AC | L414 | "thank you everyone who showed up to support us tonight after being targeted for over 14 hours" |
| **30 Jul 2018, 6:07 PM** | AC | L416 | **"Snt has broken the treety, treat their territories like you would any other non Fed guild."** |
| **1 Aug 2018** | AC | L418 | **"DAU is pulling a LEF/ASF and are transferring over to a new guild, White Lotus [LTS]. They are in Fed."** |
| 5–6 Aug 2018 | AC/PC | L428–430 / L58 | Factory Entrance and Mine Base Plains returned to FFA; revised FFA list (22) |
| **23 Aug 2018** | AC | L439, L441 | **"PUN has joined the Federation."** — corrected two minutes later to **"Rejoined*"** |
| **28 Aug 2018** | AC | L443 | **"Arisen [Ris] has joined The Federation."** |
| **31 Aug 2018, 7:50 PM** | AC | L454 | Goden: **"To clarify, Lunatic [Mox] has left The Federation."** |
| **31 Aug 2018, 9:33 PM** | AC | L456 | **"Kasai Shinrai [Two] is no longer in Federation."** |
| **1 Sep 2018** | AC | L457–486 | **First weekly update.** Joins that week: PUN (rejoin), Arisen ("Goden's new guild"), **Metric [Met]**, **Odysseia [Oys]**. Departures: **Ex Nihilo**, Lunatic, Kasai Shinrai. One further applicant denied, unnamed. Per-guild mob-defence preferences listed. Lunatic's territories reassigned to Odysseia. **"In the 9 days this update covers, there were 15,120 unique wars"** |
| **2 Sep 2018** | AC | L488 | **"Evidence arose that Metric [Met] only joined the alliance to spy and cause internal chaos and has been removed from the alliance as a result."** |
| **3 Sep 2018, 5:37 PM** | AC | L490 | **"Nethers Ascent [TNA] has joined The Federation"** |
| 3 Sep 2018, 6:09 PM | AC | L492 | TNA given "the 6 Rymek territories that Metric was assigned" |
| 4 Sep 2018 | PC | L63–68 | jpresent: the "Wynncraft Bomb Cluster" mod blocked |
| 8 Sep 2018 | AC/PC | L493–518 / L69–93 | FFA list rebuilt by province (16 territories), prefaced "Oof since i messed up the last list" |
| **9 Sep 2018, 1:36 PM** | AC | L520 | `@War` — **"A treaty has been established with Titans Valor [ANO]. They will only attack Confed and help us regain our territories."** |
| **9 Sep 2018, 1:49 PM** | AC | L522–536 | Second weekly update. **"hopefully Confed is slowing down"**; **8,741 unique wars in ~8 days** |
| 10 Sep 2018 | AC | L538–548 | New maps ("catherine made the original and then goden made adjustments"); guilds asked to pardon accidental captures during the reassignment |
| 11 Sep 2018 | AC | L550 | "Emorians [ERN] was assigned Thesead. It's not free for all anymore" |
| 15 Sep 2018 | AC | L553 | `@War` reminder not to attack ANO territories |
| **19 Sep 2018** | AC | L555 | **"Titans Valor [ANO] has re-rejoined Federation."** |
| 20 Sep 2018 | PC | L95–102 | **The application procedure**: message a discord manager ("Drew, Catherine, Simply") or a known member leader; write a paragraph; "if you have only done 50 wars, you probably are not ready to apply yet" |
| **22 Sep 2018** | AC | L557 | Viaire: **"Fantasy [Fux] is no longer in Federation. Fux has merged into SDU kinda"** |
| 26 Sep 2018 | AC | L561 | Goden: map concerns welcome from non-leaders — "Everyone here has an equal voice" |
| 29–30 Sep 2018 | PC | L104–111 | The alliance bot's database wiped and restored empty; "assigned and alliance warnings" lost, war stats retained |
| **30 Sep 2018** | AC | L563 | Goden: **"Renegade [ReA] has left the Federation."** |
| **1 Oct 2018** | AC | L565 | **"Minerva [Min] has qualified for a treaty with Federation (Similar to what ANO had before)."** |
| 12 Oct 2018 | PC | L112–138 | FFA list revised: Thesead and Bandit's Toll added, Thanos dropped, Battle Tower restored |
| 17–20 Oct 2018 | AC | L570–585 | Titans Valor ceremony at Selchar Town Square, alliance invited |
| **19 Oct 2018** | AC | L582 | **"After seeing the vote and considering, Aphelion officially resigns from Federation."** |
| 26–27 Oct 2018 | AC | L586–595 | Sins of Seedia Halloween event, Gelibord WC8 |
| **27 Oct 2018** (announced 29th) | AC | L597–600 | **"The Hive [THI] has left the Federation on Saturday, October 27, 2018. Minerva [Min] has joined the Federation on Saturday, October 27, 2018. Odysseia [Oys] has left the Federation."** |
| **29 Oct 2018, 3:29 PM** | AC | L602 | **"Fantasy [Fux] has rejoined the Federation"** |
| 29 Oct 2018, 4:29 PM | AC | L604–605 | `@War` — do not attack The Hive; "They are attempting to help Federation, but they will target any guild that attacks Hive, even Fed guilds" |
| **29 Oct 2018, 8:07 PM** | AC | L607 | **"Nethers Ascent [TNA] has left the alliance."** |
| **29 Oct 2018, 11:12 PM** | AC | L609 | **"Fantasy [Fux] has re-left the Federation (what word do we use at this point)"** — 7 h 43 min after rejoining |
| **30 Oct 2018** | AC | L613 | **"The Divine Swords [DsQ] has been kicked from the Federation."** |
| **3 Nov 2018** | AC | L615 | **"Audux [uxu] is now truced with the Federation and is allowed to hold Emorians [ERN] assigned."** |
| **10 Nov 2018, 12:26 AM** | AC | L617 | Goden: **"Imperial [Imp] has left the Federation."** |
| **10 Nov 2018, 3:36 AM** | AC | L619 | Goden: **"Arisen [Ris] has left the Federation."** |
| **10 Nov 2018, 8:04 AM** | AC | L621 | Slayne: **"Peace out from PUN. It was a good ride. See you in Coa v3"** |
| **10 Nov 2018, 8:05 AM** | AC | L623 | **"Aesir guilds, IBT, SDU, and DDT, will be withdrawing from Federation… All alliances are born and then die, there was nothing wrong with federation, it was just it's time to die, like War Syndicate and Coalition."** |
| **10 Nov 2018, 8:08 AM** | AC | L625 | Goden: **"also Federation is gone now"** |
| **10 Nov 2018, 9:14 AM** | AC | L627 | **"The Kingdom of Foxes [Fox] and Emorians [ERN] are leaving the Federation."** |
| **10 Nov 2018, 10:11 AM** | AC | L629 | **"Minerva [Min] is leaving the Federation, not that it means anything lol"** |
| **10 Nov 2018, 10:17 AM** | PC | L141–148 | `@everyone` — **"9 months. or 267 days. or 6,408 hours. After so long, Federation has finally died."** |
| 10 Nov 2018, 10:32 AM | PC | L150 | "yes that is a record for the longest a mega alliance has held the map, good luck beating it" |
| 13 Nov 2018 | PC | L151–157 | The tribute thread (thread-237070) linked |
| **10 Dec 2018** | AC | L631 | Titans Valor: **"Titans Valor [ANO] remained in Federation, keeping our promise that we would stay with the alliance until the end to prove our loyalty."** |
| 19 Feb 2019 | PC | L159–161 | "One year ago today, the **3 day old** Federation focused its attacks on HackForums and became the undeniable victor of the Coalition Civil War" |
| 9 Mar 2021 | PC | L163 | Drew1011 makes the server's archives, "as well as the Super Secret Leader Chat", public — the act that makes this export possible |

### The founding date, from the alliance's own arithmetic

Two independent sums in the public channel land on **16 February 2018**. "267 days" counted back
from 10 Nov 2018 gives 16 Feb 2018 exactly, and 6,408 hours is 267 days exactly (L143–145). The
19 Feb 2019 anniversary post calls the Federation "3 day old" on 19 Feb 2018 (L161), giving 16 Feb
again. The tribute's separate "8 months and 25 days" also runs 16 Feb → 10 Nov.

**This corrects how our articles read that figure.** `the-federation` and `federation-era` both
present "8 months and 25 days" as the length of *map control*, which the territory reconstruction
dates from 21 Feb. The channel shows the number is the alliance's **lifetime**, measured from its
founding on 16 Feb — five days earlier. Drew1011 elided the two himself ("Federation maintained
control of the map for roughly 9 months straight"), but the articles should not repeat the
elision.

---

## 3. The 21 February 2018 territory division

Posted by Drew1011 at 9:12 PM on 21 Feb 2018 (05:12 UTC, 22 Feb), tagged to two roles the export
has anonymised as `@unknown-role`. Transcribed verbatim and complete (L12–36):

> Angels of Eternal [AoE]: Dark Forest (Hot Pink)
> Buildcraftia [BCr]: West Swamp (Bright Red)
> Death Reapers [DxR]: Desert (Purple)
> Deimos [Ric]: Mid Ocean (Gray)
> Divine Swords [DsQ]: East Kander and Cinfras surroundings (Purple)
> DogsAmongUs [DAU]: Jungle and Ragni (Dark Red)
> Fantasy [Fux]: Mid Canyon (Light Blue)
> Hall of Fame [HoF]: Corkus and West Ocean (Gold)
> Holders of LE [HoL]: Cinfras County and Aldorei (Teal)
> IceBlueTeam [IBT]: Nesaak (Sky blue)
> Illustratus [lus]: Nemract (Gray)
> Immortalish [Smd]: Time Valley (Pink)
> Imperial [Imp]: Light Forest and Quartz Mines (Maroon)
> Kasai Shinrai [Two]: Nivla Forest and Detlas Suburbs (Light Green)
> Kingdom Foxes [Fox]: South Molten Heights and Sky Islands (Blue)
> KingdomPhoenixes [Phx]: South Canyon (Orange)
> LE Flowers [LEF]: Llevigar (Dark Blue)
> Serptentem Empire [SNK]: East Swamp (Yellow)
> Sins of Seedia [SDU]: North Canyon and North Molten Heights (Light Green)
> Titans Valor [ANO]: Light Realm, Northeast Ocean, and Rymek (Tan)
> TheEnchanted [Tch]: Elkurn, North Nesaak (Dark Green)
> The Hive [THI]: Nether Gate and surroundings (Lime)
> FFA TERRITORIES ARE IN BLACK

Spellings are the source's ("Serptentem", "Buildcraftia", "[lus]" for Illustratus's [Ius]).
Note two colour collisions in the leadership's own table — Divine Swords and Death Reapers are
both "Purple", Kasai Shinrai and Sins of Seedia both "Light Green" — and that Deimos and
Illustratus share "Gray". The later lists resolve these.

### What it is, and what it is not

**This is the Federation's map of itself on its sixth day.** It is a *partition of the province*,
not a report of holdings. Checked against `territory_exchanges` at the moment of posting
(22 Feb 2018 05:12 UTC), the actual leaders were Hall of Fame 50, Sins of Seedia 44, Holders of LE
43, DogsAmongUs 42, Fantasy 39, Imperial 35, Titans Valor 22, Kingdom Foxes 21 — a distribution
that matches no line in the table. Several assignees held **nothing at all** that hour, including
BuildCraftia, The Hive, Illustratus, Immortalish, TheEnchanted and Death Reapers, and HackForums,
which the alliance had attacked three days earlier, **still held 10 territories**.

So the division is an **instruction to redistribute**, taking land from the four guilds that had
won the opening week and handing regions to guilds that had none. That is a substantive finding
about how the Federation worked, and it explains the sequence of five further assignments through
June: each is a re-plan, not a census.

**Do not treat any assignment list as a territory count.** The per-guild "terrs" figures that
appear from 10 March onward are *sizes of assigned regions*. Summed, the 10 Mar list gives 362
assigned + 12 FFA + 7 reserved = 381, against 383 territories on the map — i.e. a complete
partition. Actual holdings on 11 Mar were quite different (Imperial 61 against 30 assigned,
Kingdom Foxes 58 against 27, BuildCraftia 51 against 22).

### The five later assignments

| Posted | Lines | Guilds listed | FFA count | Notable |
|---|---|---|---|---|
| 10 Mar 2018 | L49–77 | 21 | 12 | First with per-guild counts; adds As Darkness Falls and Paladins United; keeps Serpentem Empire (4). Adds a category, "Available Territories for the Future (FFA for now)" (7) |
| 24 Mar 2018 | L78–120 | 19 | 21 | Serpentem Empire, Illustratus and Immortalish gone; Kasai Shinrai cut to 5; the Molten Heights bloc moved wholesale into FFA |
| 22 Apr 2018 | L121–160 | 17 | 22 | First appearance of Angelic, Constellations, Diamond Deities and Emorians; BuildCraftia, DogsAmongUs, Hall of Fame's swamp, Holders of LE's old regions gone or reassigned |
| 10 May 2018 | L196–240 | 19 | 23 | First list to show a member at **zero** — "(0) DogsAmongUs [DAU] -"; adds Lunatic and TheNoLifes |
| 4 Jun 2018 | L241–268 | 19 | 21 | Five members at zero (Constellations, DogsAmongUs, Holders of LE, KingdomPhoenixes, Paladins United); Imperial peaks at 50 assigned |

The zero rows are the useful part: **the channel records a guild as a member while assigning it
nothing.** DogsAmongUs sits at zero from 22 Apr to its August rename, and the alliance was still
organising its defence in July (L322). This is exactly the case that map-inferred stint boundaries
get wrong.

### The free-for-all lists corroborate the wiki's map methodology

`territory-exchanges.md` says the wiki's analyses exclude a high-churn set "historically clusters
such as Detlas, the Hive, Lava Lake, Factory Entrance and Emerald Trail", derived empirically. The
Federation's own designated FFA list of 8 Sep 2018 (L493–518) names sixteen territories. Ranking
every territory by capture count in the exact window 8 Sep – 11 Oct 2018 gives, in order: Detlas,
Lava Lake, Hive, Temple of Legends, Emerald Trail, Herb Cave, Cinfras, Factory Entrance, Jungle
Lake, [Detlas Close Suburbs], [Nemract Town], Mine Base Plains, Thanos … **Eleven of the fourteen
highest-churn territories are on the Federation's FFA list, and fourteen of the list's sixteen
entries rank in the top thirty** — the two that do not are Qira's Battle Room and Jofash Tunnel.
The three high-churn territories the alliance did **not** free (Detlas Close Suburbs, Nemract Town,
Nemract Road) are worth a second look before the exclusion set is next revised. The wiki's set was
reverse-engineered from the
data; the alliance's own contemporaneous designation independently confirms it. This is worth a
sentence in `territory-warfare` or `chronicle-map-methodology`.

The FFA set was also actively managed and is dated at each revision (L71, L117, L160, L239, L268,
L430, L495–517, PC L113–137), including a formal return of two territories to FFA on 5 Aug
(L428) and the removal of Thesead from FFA on 11 Sep (L550) followed by its reinstatement by
12 Oct (PC L121).

---

## 4. Membership evidence

### 4.1 The founding roster is 22 guilds, and one of them is missing from the chronicle

The 21 Feb list names 22 guilds. The chronicle records 21 stints opening 2018-02-15 plus
Illustratus on 2018-02-18 — also 22 — but **the two sets are not the same**:

- On the channel's list and **not** in the chronicle: **Death Reapers [DxR]**.
- In the chronicle from 15 Feb and **not** on the channel's list: **As Darkness Falls [ASF]**
  (first appears 10 Mar, L51) and **Metric [Met]** (see §4.3).

**Death Reapers is the single clearest addition this source makes.** It appears on the alliance's
own founding division with a region (Desert) and a colour (Purple), and it is on Drew1011's
November roster of 37 (thread-237070 post #1). The `the-federation` article currently disposes of
it as a name that "resolves to no known guild in the prefix record". The channel settles that it
was a real member. It also explains the prefix problem: **`territory_exchanges` contains zero
captures by "Death Reapers" in 2018.** It was assigned the Desert and never took a territory —
which is why it is invisible to every map-derived method.

### 4.2 Announced changes, checked against the chronicle's 43 stints

Confirmed to the day (channel date = chronicle date) at fourteen stint boundaries:

| Event | Channel | Chronicle |
|---|---|---|
| Titans Valor kicked | 4 May, L185 | ANO left 2018-05-04 ✔ |
| TheNoLifes joins | 4 May, L187 | TNL joined 2018-05-04 ✔ |
| Lunatic joins | 8 May, L195 | joined 2018-05-08 ✔ |
| Titans Valor rejoins | 13 Jun, L273 | joined 2018-06-13 ✔ |
| Renegade joins | 7 Jul, L320 | joined 2018-07-07 ✔ |
| Titans Valor leaves (2nd) | 22 Jul, L362 | left 2018-07-22 ✔ |
| Angels of Eternal leaves | 22 Jul, L362 | left 2018-07-22 ✔ |
| Aphelion joins | 22 Jul, L362 | joined 2018-07-22 ✔ |
| Arisen joins | 28 Aug, L443 | joined 2018-08-28 ✔ |
| Lunatic leaves | 31 Aug, L454 | left 2018-08-31 ✔ |
| Kasai Shinrai leaves | 31 Aug, L456 | left 2018-08-31 ✔ |
| Nethers Ascent joins | 3 Sep, L490 | joined 2018-09-03 ✔ |
| Titans Valor rejoins (3rd) | 19 Sep, L555 | joined 2018-09-19 ✔ |
| Aphelion leaves | 19 Oct, L582 | left 2018-10-19 ✔ |

These fourteen boundaries are a strong validation of the chronicle's 2018 roster work: where the chronicle had a
specific date, the contemporaneous channel almost always agrees exactly.

Off by one day, the chronicle always the earlier. A timezone offset does not explain it — Pacific
times convert *forward* into UTC, not back — so these dates were most likely derived from activity
windows in the capture log rather than from the announcements:

| Event | Channel | Chronicle | Correct to |
|---|---|---|---|
| Paladins United leaves (1st) | 25 Jun, L289 | 2018-06-24 | 2018-06-25 |
| KingdomPhoenixes leaves | 25 Jun, L289 | 2018-06-24 | 2018-06-25 |
| Verinian Trials joins | 25 Jun, L289 | 2018-06-24 | 2018-06-25 |
| Ex Nihilo joins | 30 Jun, L304 | 2018-06-29 | 2018-06-30 |
| DogsAmongUs → White Lotus | 1 Aug, L418 | DAU left 08-05, LTS joined 08-02 | both 2018-08-01 |
| Paladins United rejoins | 23 Aug, L439 | 2018-08-22 | 2018-08-23 |
| Metric removed | 2 Sep, L488 | 2018-09-03 | 2018-09-02 |
| Renegade leaves | 30 Sep, L563 | 2018-09-29 | 2018-09-30 |
| The Hive leaves | 27 Oct, L597 | 2018-10-26 | 2018-10-27 |
| Minerva joins | 27 Oct, L599 | 2018-10-26 | 2018-10-27 |
| Fantasy rejoins | 29 Oct, L602 | 2018-10-28 | 2018-10-29 |

Contradicted outright — the important ones:

| Guild | Chronicle | Channel says | Evidence |
|---|---|---|---|
| **Fantasy** (1st stint) | joined 2018-03-19 | **assigned Mid Canyon on 21 Feb 2018** (L20), and listed in the 10 Mar and 24 Mar assignments | Settles storytime C-7 in favour of a February defection |
| **Paladins United** (1st) | joined 2018-03-19 | **8 Mar 2018** (L48), and in the 10 Mar assignment (L64) | Storytime says the request came 7 Mar |
| **Metric** | joined 2018-02-15 | **joined in the week of 26 Aug 2018** (L465) | Metric is absent from all six assignment lists, Feb–Jun, and its first capture in the log is 16 Mar 2018; TNA inherits "the 6 Rymek territories that Metric was assigned" on 3 Sep (L492) |
| **Hall of Fame** | left 2018-09-29 | **25 Jul 2018** (L397) | HoF was hosting alliance events on 8 Jun and 22 Jul; its 29 Sep date matches its last capture, not its departure |
| **Verinian Trials** | left 2018-11-09 | **25 Jul 2018** (L397) | Same announcement |
| **Ex Nihilo** | left 2018-11-09 | **week of 26 Aug 2018** (L468) | Its captures stop entirely in September |
| **Nethers Ascent** | left 2018-11-09 | **29 Oct 2018** (L607) | |
| **The Divine Swords** | left 2018-11-09 | **kicked 30 Oct 2018** (L613) | The only "kicked" in the record besides ANO |
| **Fantasy** (2nd stint) | 2018-10-28 → 2018-11-09 | **rejoined 3:29 PM and re-left 11:12 PM on 29 Oct 2018** (L602, L609) | A stint of 7 h 43 min |
| **BuildCraftia** | left 2018-11-09 | absent from every assignment from 22 Apr onward; last on 24 Mar (L83) | Corroborates storytime's 30 Mar 2018 expulsion vote / walkout |
| **LE Flowers** | left 2018-03-14 | still assigned "Llevigar and Plains" on **24 Mar 2018** (L105) | Its last capture is 15 Mar; the chronicle date is last-activity, not departure |
| **Serpentem Empire** | left 2018-03-12 | assigned 4 territories on **10 Mar** (L65), gone by 24 Mar | Consistent; last capture 13 Mar |
| **Odysseia** | left 2018-10-28 | "has left" announced 29 Oct (L600), undated | 27–29 Oct |

Weak or inferential (the channel's silence, not its statement):

- **Deimos**, **Immortalish**, **TheEnchanted**, **Illustratus** and **Holders of LE** all carry
  a chronicle departure of 2018-11-09 but vanish from the assignment lists far earlier — Deimos
  and Immortalish after 21 Feb, TheEnchanted after 10 Mar, Illustratus after 24 Mar, Holders of LE
  reduced to zero on 4 Jun. Their capture activity agrees (Deimos: 22 captures in March and none
  after; Immortalish: one in March, one in May; Illustratus: 62 in March, then nothing until
  August). None of these has a departure announcement, so each is an **inference**.
- **Angelic** is named once (22 Apr, L122) and never announced either way.

### 4.3 The bulk 2018-11-09 problem

Twenty of the chronicle's 43 stints close on **2018-11-09**. The channel shows **every announced
final departure falling on 10 November** — Imperial 12:26 AM, Arisen 3:36 AM, Paladins United
8:04 AM, IceBlue Team / Sins of Seedia / DiamondDeities 8:05 AM, Kingdom Foxes and Emorians
9:14 AM, Minerva 10:11 AM (L617–629); the chronicle already dates those three Aesir guilds to
2018-11-10. The 09 date appears to be a placeholder. Some of the 09 guilds should move to 10 Nov;
the rest should move to their real, much earlier departures listed above.

### 4.4 Guilds and blocs the channel names that we do not record

- **Death Reapers [DxR]** — founding member, see §4.1. **Add.**
- **CGoW** — the party Hall of Fame and Verinian Trials "partnered with" on defecting, 25 Jul 2018
  (L397). Unattested anywhere else in the corpus. The Federation went to war with it the same day.
- **Confed** — the name the Federation's leadership used for its opposing bloc in September 2018
  (L520, L534). Our articles record only "[Ent]", the tag `thread-236962` gives for the enemy
  alliance in November, and note it "matches no alliance recorded elsewhere". "Confed" is a
  second, earlier name for the Federation's autumn opposition, from the Federation's own side.
  Whether Confed, CGoW and [Ent] are the same body is **not established by this source**.
- **Audux [uxu]** — truced 3 Nov 2018 and permitted to hold Emorians' assigned territories
  (L615). Its captures in the log begin 20 Oct 2018 and run to year end.
- **Minerva [Min]** — in the chronicle as a member from late Oct; the channel additionally shows
  it holding a **treaty** from 1 Oct (L565).
- **Snt** (House of Sentinels) — treaty 7 Jul, broken 30 Jul (L318, L416). It is in the chronicle
  as an Alliance Alliance guild only.
- Mentioned in passing but not as members: **KnV** and **Fuq** (Kangronomicon), joked about on
  9 Sep as the two guilds that would make it "Legio 2.0" (L525).

### 4.5 A tier the chronicle has no field for

The channel documents a **truce status distinct from membership**, with its own rules, granted
four times and revoked once: Snt (7 Jul – 30 Jul), Titans Valor (9 Sep – 19 Sep, then upgraded to
membership), Minerva (1 Oct – 27 Oct, likewise), Audux (3 Nov –). The ANO instrument is spelled
out: "They will only attack Confed and help us regain our territories. Do not attack ANO unless
you are reclaiming your assigned territories from them" (L520). **These should not be entered as
membership stints.** They belong in prose, and possibly in a short section on how the Federation
managed non-members.

---

## 5. War orders and campaigns

What the alliance actually told its members to do, in order:

1. **Command structure, 17 Feb (L11).** Captains get a role so they can "discuss wars in the war
   channel". A `@War` role appears in the tags from 13 Jul (L329); before 25 Jun the export shows
   only anonymised `@unknown-role`.
2. **Redistribute the map, 21 Feb – 4 Jun (six assignments).** The core war order of the whole
   period is not "attack X" but "hold your assigned". Enforcement language recurs: "Go fetch now"
   (L240), and the standing rule that a Federation guild may only attack a truced party "unless
   you are reclaiming your assigned territories from them" (L520, repeated L553).
3. **The March counterattack, 3 Mar (L44).** "We're actually doing a decent job of fighting back.
   If you can war, please log on and help fight back against them! We did this just two weeks ago,
   we can do it again." This is the only contemporaneous trace of the March relapse in the corpus.
   Its "two weeks ago" points back to ~17 Feb, i.e. the founding battle.
4. **Free-fire on expelled members.** Twice: "ANO has been kicked from the alliance, **feel free to
   attack them**" (4 May, L185); "Snt has broken the treety, **treat their territories like you
   would any other non Fed guild**" (30 Jul, L416).
5. **The 25 July war (L397).** "HoF and ViT are leaving and have partnered with CGoW, **get ready
   to War**." Six hours later: "a personal thank you to everyone who warred today" (L399). Capture
   data supports a sharp asymmetry in the outcome: Verinian Trials made 876 captures in July and
   **none in August**; Hall of Fame made 698 in August, i.e. it kept fighting. Drew1011's
   retrospective claim that the defectors were "destroyed within minutes" holds for ViT and not
   for HoF.
6. **Defence economics as policy.** Guilds published their own defence preferences and the
   alliance circulated them: "when defending DAU territories can you please use 1000 mobs?… so we
   don't burn as much money defending" (10 Jul, L322); a per-guild table on 1 Sep (L473–479) —
   Sins of Seedia "If under siege, <100 lv50s. In general, no lv100/90s"; Aphelion "No lv.
   90s/100s"; The Divine Swords "<500 lv50s"; DiamondDeities "<300 lv50s"; White Lotus "more mobs
   for more money"; TheNoLifes "Add bosses if you want" — and Arisen's addendum of 9 Sep, "doesn't
   want ANY high leveled snipers… add honor guards and bishops" (L530).
7. **Mobilisation discipline is a running failure.** 2 Mar (L42), 27 Jun (L298–300), 29 Jun
   (L302), 19 Jul (L348–354): "People were tagged 3 times before anything was done in which the
   first 2 were more or less completely ignored… It seems these tags are not taken seriously,
   treated as spam and completely ignored." An alliance holding the whole map could not reliably
   get its members to log in.
8. **Operational security.** 6 Mar (L46) and 28 Jul (L412): keep alliance business out of the
   public channels, "as there are a lot of guests in the public channels, many of which we are
   actively at war with."
9. **The two war totals.** 15,120 unique wars in the 9 days to 1 Sep (L486); 8,741 in the ~8 days
   to 9 Sep (L534). **Both check out against the capture log**: 15,254 exchanges 23 Aug – 1 Sep,
   and 9,062 for 2–9 Sep — within 1% and 4% respectively. The alliance's bot was counting
   essentially what `territory_exchanges` records, which cross-validates both the channel's
   numbers and the dataset. These are the only hard warfare volumes we have for 2018 from a
   contemporaneous non-map source.
10. **De-escalation orders at the end.** 29 Oct, after The Hive had already left: "It's advisable
    not to attack THI… If Fed guilds stop attacking THI, it'll free up THI to help us and the Fed
    guild too. Don't attack THI, doing so is directly counter productive to this alliance" (L604).

---

## 6. The collapse

### What the channel shows in the six weeks before

A steady, announced disintegration, not a surprise:

- **19 Oct** — Aphelion resigns "After seeing the vote and considering" (L582). A member guild
  put its Federation membership to an internal vote and lost it.
- **27 Oct** — The Hive leaves (L597). Minerva, a treaty partner since 1 Oct, joins the same day
  (L599) — the alliance was still recruiting while shedding a founding member.
- **~27–29 Oct** — Odysseia leaves (L600).
- **29 Oct** — Nethers Ascent leaves (L607). Fantasy rejoins at 3:29 PM and leaves again at
  11:12 PM (L602, L609).
- **30 Oct** — The Divine Swords kicked (L613).
- **3 Nov** — **Audux truced and "allowed to hold Emorians [ERN] assigned"** (L615). The alliance
  conceded a member's assigned territory to an outsider a week before the end. This is the single
  most telling line in the run-up and has no parallel earlier in the year.

### The last day, minute by minute

All times US Pacific as exported; EST equivalents in brackets (PST = UTC−8 from 4 Nov 2018).

| Pacific | EST | Line | Event |
|---|---|---|---|
| 12:26 AM | 3:26 AM | L617 | Imperial leaves (announced by Goden) |
| 3:36 AM | 6:36 AM | L619 | Arisen leaves |
| 8:04 AM | 11:04 AM | L621 | Paladins United — "Peace out from PUN… See you in Coa v3" |
| 8:05 AM | 11:05 AM | L623 | Aesir — IceBlue Team, Sins of Seedia, DiamondDeities withdraw |
| 8:08 AM | 11:08 AM | L625 | Goden: "also Federation is gone now" |
| 9:14 AM | 12:14 PM | L627 | Kingdom Foxes and Emorians leave |
| 10:11 AM | 1:11 PM | L629 | Minerva leaves |
| 10:17 AM | 1:17 PM | PC L141 | Drew1011 announces the death publicly |

**This confirms Drew1011's tribute to the hour.** He wrote that "One guild left early, roughly
3 AM EST on Saturday the 10th of November, and then the floodgates opened" (thread-237070 post #1).
Imperial's departure at 12:26 AM Pacific **is** 3:26 AM EST, and the next departure is more than
three hours later. The "one guild" is now named: **Imperial**.

It also confirms `thread-236962` post #17 (Ascended Kitten, 11 Nov 2018), whose sequence — Hive a
month earlier, then Odysseia, then Imperial, then Arisen, then the Aesir guilds last after
sustained warring — matches the channel exactly, including the order of the two guilds and the
identity of the last defenders. Two independent contemporaneous sources agreeing on an ordering is
as good as the 2018 record gets.

The capture log agrees on the intensity: hourly exchanges run at a ~50/hour baseline through 8–9
Nov, climb from about 21:00 UTC on 9 Nov, and hold at 90–151 per hour from 00:00 to 13:00 UTC on
10 Nov, easing through that evening and back to baseline on the 12th. The surge is real, and it
begins before Imperial's announcement — the fighting preceded the first exit.

The Aesir statement (L623) is the only reasoned exit in the record and deserves to be quoted in
`the-federation-dies` and `aesir-pact`:

> "All alliances are born and then die, there was nothing wrong with federation, it was just it's
> time to die, like War Syndicate and Coalition. Thank you for including us in your journey, it
> was amazing to be a part of it."

Note it lists Aesir as **IBT, SDU and DDT** — Fantasy is not included, consistent with Fantasy
having left the Federation for the last time twelve days earlier.

### What the channel does not show

No enemy is named on 10 November. "Confed" appears only in September (L520, L534), "CGoW" only in
July (L397), and "[Ent]" not at all. The channel gives no cause for the collapse: departures are
announced, motives are not. Drew1011's "boredom" and "internal affairs" are from the tribute three
days later, not from the channel.

### The coda

A month afterwards, on 10 Dec, Titans Valor posted "Titans Valor [ANO] remained in Federation,
keeping our promise that we would stay with the alliance until the end to prove our loyalty"
(L631) — the last message in the channel. It is a claim by a guild that had been kicked once and
rejoined twice, made into an empty room; record it as ANO's claim, not as fact.

---

## 7. Corroborations and contradictions

### Corroborates the storytime

| # | Storytime | Channel |
|---|---|---|
| 1 | Paladins United admitted 7 Mar 2018 at Slayne's request (L1101) | "PUN has been accepted in to the Federation", 8 Mar (L48). One day, and the difference is request vs. announcement |
| 2 | Fantasy defected from Alliance Alliance to the Federation on 18 Feb 2018 | Fantasy is assigned Mid Canyon in the 21 Feb division (L20) — inside the Federation three days later |
| 3 | The March relapse and counterattack, 1–5 Mar | "We're actually doing a decent job of fighting back… We did this just two weeks ago", 3 Mar (L44) |
| 4 | BuildCraftia expelled / walked out 30 Mar 2018 | Present on 24 Mar (L83), absent from every list from 22 Apr |
| 5 | Serpentem Empire reduced to near-nothing inside the alliance | Assigned 4 territories on 10 Mar (L65) — the smallest allocation in the table — and gone by 24 Mar |
| 6 | Drew1011 founded and effectively ran the alliance | He posts 38 of 114 messages and every membership and war-policy announcement through August |
| 7 | The Federation "copied the exact same structure that Coalition had" | Assigned regions, a leader chat, per-guild colours, an FFA set — the same instruments the storytime describes for the Coalition's Wynn division |
| 8 | "One guild left early, roughly 3 AM EST" | Imperial, 12:26 AM Pacific = 3:26 AM EST (L617) |
| 9 | Holders of LE revived under Thundderr and then faded | HoL is assigned 24 territories on 10 May and **zero** on 4 Jun (L215, L255) |

### Contradicts or refines the storytime

| # | Storytime | Channel | Verdict |
|---|---|---|---|
| A | "The Hall of Fame / Verinian Trials defection, 25 Jun 2018" | On **25 Jun** the departures were **Paladins United and KingdomPhoenixes**, and **Verinian Trials joined** (L289). HoF and ViT left together on **25 Jul** (L397) | **The month is wrong.** Drew appears to have merged two 25ths a month apart. Correct the date and the pairing |
| B | The defectors were "destroyed within minutes" | ViT: 876 captures in July, **0 in August**. HoF: 698 captures in August | True in substance for ViT; false for HoF. Also resolves storytime issue **C-11**: HoF was still fighting through August, which is why two November sources could call it "first to rebel" |
| C | Holders of LE "dead (Apr 2018)" | Assigned 24 territories on 10 May (L215) | The guild was moribund but still a member and still allocated land into May |
| D | The Federation is described as a 22-guild bloc from the outset | The founding division is exactly **22 guilds** (L14–35) | Confirms the figure and supplies the names |

### Corroborates our current articles

- **`the-federation-dies` / `federation-era`**: the collapse sequence from `thread-236962` is
  confirmed name for name and in order (§6).
- **`aesir-pact`**: the pact's three surviving guilds were the last out, and said so themselves
  (L623).
- **`the-federation`**: the 2/3-majority governance is indirectly supported — Aphelion resigns
  "after seeing the vote" (L582), the reassignment of Lunatic's territories was decided because
  "We voted on it and came to that decision" (L481), and Goden insists non-leaders have "an equal
  voice" on map decisions (L561).
- **`coalition-civil-war`**: the 19 Feb 2019 anniversary post independently dates the HackForums
  attack to 19 Feb 2018 (PC L161).
- **`territory-warfare` / map methodology**: the FFA lists confirm the high-churn exclusion set
  empirically (§3).

### Contradicts our current articles

1. **`fantasy-turns-on-the-federation`** states Fantasy "rejoined the Federation on 29 Oct 2018 —
   the only date of this war the written record preserves — twelve days before the alliance died."
   The channel shows Fantasy **rejoined at 3:29 PM and left again at 11:12 PM the same day**
   (L602, L609). The article's closing image is wrong.
2. **The same article** dates Fantasy's departure to the week of 28 May 2018 by map inference. The
   channel's only statement is Viaire's on **22 Sep**: "Fantasy [Fux] is no longer in Federation.
   Fux has merged into SDU kinda" (L557). These need not conflict — the leadership may have taken
   four months to formalise a de facto exit — but the article should carry both, and the "merged
   into SDU" claim is new and unexplained anywhere else.
3. **`the-federation` and `federation-era`** present "8 months and 25 days" as the duration of map
   control. It measures the alliance's lifetime from 16 Feb (§2).
4. **`the-federation`** calls Death Reapers a name that "resolves to no known guild". It was a
   founding member with an assigned region (§4.1).
5. **`the-federation`** describes "LE Flowers → DiamondDeities, DogsAmongUs → White Lotus, As
   Darkness Falls → Constellations" as "rename chains… verified by abutting activity windows".
   The channel describes the mechanism differently, and from inside: "DAU is **pulling a LEF/ASF**
   and are **transferring over to a new guild**, White Lotus [LTS]" (L418). These were membership
   migrations to a newly created guild, not renames, and the alliance had seen the pattern twice
   before. Worth correcting the wording.
6. **The opposing bloc.** Articles say "[Ent] … matches no alliance recorded elsewhere in the
   corpus." The Federation's own name for its autumn enemy was **Confed** (L520, L534), and its
   July enemy was **CGoW** (L397).

---

## 8. Proposed chronicle changes

Marked **[C]** confirmed by this source (an explicit dated statement in the channel) or **[I]**
inferred (from absence, from an assignment list, or from map data read together with the channel).

### Add

1. **[C] Death Reapers — Federation member from 2018-02-15/21.** Departure undocumented; the guild
   never appears again after 21 Feb and has no captures in the log, so leave `left` null or mark
   it inferred at ~Mar 2018. Note in the guild record that it held no territory.

### Correct — joins

2. **[C] Fantasy, 1st stint: `joined` 2018-03-19 → 2018-02-18.** Assigned a region on 21 Feb
   (L20); the 18 Feb date is the storytime's, which this now supports. If a channel-only date is
   preferred, use 2018-02-21.
3. **[C] Paladins United, 1st stint: `joined` 2018-03-19 → 2018-03-08** (L48).
4. **[C] Metric: `joined` 2018-02-15 → ~2018-08-26** (L465). Also `left` 2018-09-03 → **2018-09-02** (L488).
5. **[C] Verinian Trials: `joined` 2018-06-24 → 2018-06-25** (L289).
6. **[C] Ex Nihilo: `joined` 2018-06-29 → 2018-06-30** (L304).
7. **[C] Paladins United, 2nd stint: `joined` 2018-08-22 → 2018-08-23** (L439/441).
8. **[C] White Lotus: `joined` 2018-08-02 → 2018-08-01** (L418).
9. **[C] Minerva: `joined` 2018-10-26 → 2018-10-27** (L599).
10. **[C] Fantasy, 2nd stint: `joined` 2018-10-28 → 2018-10-29** (L602).
11. **[I] Constellations: `joined` 2018-04-23 → 2018-04-22** (first assigned, L125).
12. **[I] Emorians: `joined` 2018-03-19 → between 2018-03-24 and 2018-04-22.** Absent from the
    24 Mar assignment, present on 22 Apr (L129). Low confidence; the 19 Mar date comes from the
    Alliance Alliance stint boundary and may still be right.

### Correct — departures

13. **[C] Hall of Fame: `left` 2018-09-29 → 2018-07-25** (L397).
14. **[C] Verinian Trials: `left` 2018-11-09 → 2018-07-25** (L397).
15. **[C] Ex Nihilo: `left` 2018-11-09 → ~2018-08-26** (L468).
16. **[C] Nethers Ascent: `left` 2018-11-09 → 2018-10-29** (L607).
17. **[C] The Divine Swords: `left` 2018-11-09 → 2018-10-30** (kicked, L613).
18. **[C] Fantasy, 2nd stint: `left` 2018-11-09 → 2018-10-29** (L609). The stint is under eight hours.
19. **[C] Paladins United 1st and KingdomPhoenixes: `left` 2018-06-24 → 2018-06-25** (L289).
20. **[C] DogsAmongUs: `left` 2018-08-05 → 2018-08-01** (L418).
21. **[C] The Hive: `left` 2018-10-26 → 2018-10-27** (L597).
22. **[C] Renegade: `left` 2018-09-29 → 2018-09-30** (L563).
23. **[C] Odysseia: `left` 2018-10-28 → 2018-10-27/29** (L600; the announcement is undated).
24. **[C] The 2018-11-09 bulk placeholder → 2018-11-10** for the guilds actually present at the
    end: Imperial, Arisen, Paladins United, Kingdom Foxes, Emorians, Minerva (L617–629).
25. **[I] BuildCraftia: `left` 2018-11-09 → ~2018-03-30.** Last assignment 24 Mar; storytime dates
    the expulsion vote to 30 Mar.
26. **[I] Deimos: `left` 2018-11-09 → ~2018-03.** No assignment after 21 Feb; no captures after March.
27. **[I] Immortalish: `left` 2018-11-09 → ~2018-03.** Same pattern.
28. **[I] TheEnchanted: `left` 2018-10-23 → ~2018-03.** Last assigned 10 Mar (L68).
29. **[I] Illustratus: `left` 2018-11-09 → ~2018-04.** Last assigned 24 Mar (L95).
30. **[I] Holders of LE: `left` 2018-11-09 → ~2018-06.** Assigned 24 territories on 10 May, zero
    on 4 Jun (L215, L255).
31. **[I] LE Flowers: `left` 2018-03-14 → ≥2018-03-24.** Still assigned on 24 Mar (L105).
32. **[I] As Darkness Falls: `joined` 2018-02-15 → ≤2018-03-10.** Absent from the founding
    division; first assigned 10 Mar (L51). Weak — a guild with no region would not be listed.

### Events

33. **[C] Add: the Federation's territory division, 21 Feb 2018.** The founding act of the
    alliance's internal order, and the earliest dated document it produced.
34. **[C] Re-date `fantasy-turns-on-the-federation`'s end.** The rejoin-and-re-leave of 29 Oct
    2018 replaces "rejoined 29 Oct, twelve days before the collapse".
35. **[C] Add: Hall of Fame and Verinian Trials defect to CGoW, 25 Jul 2018**, with a Federation
    counter-attack the same day. Currently the corpus has this a month early and mis-paired.
36. **[C] Add or annotate: the treaty tier** — Snt (7 Jul, broken 30 Jul), Titans Valor (9 Sep),
    Minerva (1 Oct), Audux (3 Nov). Prose, not membership stints.
37. **[C] Annotate `the-federation-dies` with the minute-by-minute sequence and name Imperial as
    the first guild out** (§6).

### Article edits outside the chronicle DB

38. `the-federation`: fix the Death Reapers line; fix "8 months and 25 days"; fix "rename chains"
    to describe membership transfers; add the Imperial identification and the last-day sequence;
    add the FFA/assignment system as a section on how the bloc governed the map.
39. `federation-era`: the same "8 months and 25 days" correction; add the two war-volume figures
    and their agreement with the capture log.
40. `fantasy-turns-on-the-federation`: rewrite the aftermath; add Viaire's 22 Sep statement and
    the "merged into SDU" claim, attributed and flagged as unexplained.
41. `aesir-pact` and `the-federation-dies`: quote the Aesir withdrawal statement.
42. `chronicle-map-methodology` / `territory-warfare`: cite the Federation's FFA lists as
    contemporaneous confirmation of the high-churn exclusion set.
43. `paladins-united`, `titans-valor`, `sins-of-seedia`, `iceblue-team`, `diamonddeities`,
    `emorians`, `kingdom-foxes`, `imperial`, `fantasy`, `thenolifes`, `nethers-ascent`: each has a
    dated, quotable line in this channel.

---

## 9. What NOT to use

**Personal material — exclude entirely.**

- The birthday posts: PC L11–12 (Drew1011) and AC L566–567 (4 Oct, "Happy birthday to my love and
  princess… She's super old now"). Real-world personal content about named players; the style
  guide's player rule ("No real-world information whatsoever") bars it outright.
- Terms of endearment and relationship references anywhere in the channel.
- The Discord invite (L340) and Google Form (L369) links. Dead, and not ours to republish.

**Internal discipline about named individuals — use the pattern, never the person.**

- The tag-abuse cycle (L42, L298–302, L348–356, L408–410) is genuine evidence that the alliance
  struggled to mobilise. Write it as a systemic finding. **Do not** quote the rebukes as though
  aimed at anyone, and do not identify the "●" author of the 19 Jul message, who was relaying the
  leader chat.
- Gas's aside about a named player's "bad planning" (L360). Exclude.
- The anonymous leader-rating form (L482). The existence of a leader chat is usable; the fact that
  leaders rated each other and that the results caused "hilarity, happiness, and sadness" is
  gossip about named people. Exclude.
- Arianna's 30 Jul post (L414) contains profanity and refers to a targeting campaign. The 14-hour
  siege is a usable fact; quote around the language.

**Accusations the channel makes but does not evidence.**

- **Metric as a spy** (L488). The removal is a fact and belongs in the record. The *reason* is an
  accusation by the accusing party, published with no evidence and no reply. Write: "the alliance
  announced on 2 September 2018 that it had removed Metric, stating that evidence had arisen the
  guild joined to spy; no evidence was published and no account from Metric survives."
- **Ex Nihilo's departure** (L468): "dont ask, none of us leaders really understand what went down
  with that whole incident either." The date is usable; there is nothing else to report, and the
  record's silence should be stated as silence.
- **Kasai Shinrai** (L470): "nobody even knows why they were still there in the first place". A
  dismissive aside about a member guild. Use the departure date, not the sneer.
- **BuildCraftia, Snt, CGoW** — the channel gives the Federation's side of each rupture only.

**Leadership rhetoric, not fact.** Attribute if used at all; never assert.

- "Long live Federation ;D" (L548); "Literally every guild suddenly wants to join the alliance…
  whoever poisoned the water supply with Pro-Federation juice, thanks" (L462, L467, L524). The
  factual counterpart is the public application post of 20 Sep (PC L95–102), which is usable.
- "yes that is a record for the longest a mega alliance has held the map, good luck beating it"
  (PC L150) — a boast by the alliance's founder on the day it died.
- "the 3 day old Federation… became the **undeniable victor** of the Coalition Civil War" (PC
  L161, Feb 2019). This compresses a five-week war into three days and is contradicted by the
  chronicle, the community timeline and the capture data, all of which end the war on 19–20 Mar.
  Usable only as an example of how the Federation's leadership framed its own founding.
- Titans Valor's loyalty claim of 10 Dec (L631) — a claim by a guild that had been kicked once,
  and rejoined twice.
- The Aesir withdrawal statement (L623) is a *statement of position*, not a diagnosis. "There was
  nothing wrong with federation, it was just it's time to die" is the leaving guilds' framing;
  Drew1011's "boredom" and "internal affairs" is the founder's. Both are attributable claims about
  the same event, and the honest treatment is to give both and say the cause is not established.

**Structural caution.** Every assignment list is the leadership's plan for the map, published by
the guild that had the most territory on it. When a guild's allocation falls, the channel records
only the outcome, never the argument. The zero rows of 10 May and 4 Jun (L207, L249–262) are
therefore evidence of a decision, not of a negotiation — and we have no record of who lost it.

**Unverified images.** The 79 attachments are the alliance's actual maps and would let almost
every claim in §3 be checked visually. They are currently mapped by an explicitly provisional
alignment file. **Do not publish or caption any of them until the mapping is checked by eye**;
`alignment.json` warns that an earlier corpus was mis-mapped exactly this way.
