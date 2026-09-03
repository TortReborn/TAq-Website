---
id: wynncraft-wiki-gg-wiki-guild-seasons
url: https://wynncraft.wiki.gg/wiki/Guild_Seasons
kind: wiki
title: "Guild Seasons - Official Wynncraft Wiki"
fetched_at: 2026-09-03T07:05:53.457Z
raw_sha256: 127aec5fe90e9e73
note: "Wynncraft wiki Guild Seasons table: full season 1-26 dates and winners (Shy S1, ERN S2, TAq S3/S5/S8, NFR S4, DUDE S6, AVO S7...) — the era-page backbone for 2021+ standings"
---

Guild Seasons

From Wynncraft Wiki

Jump to navigation
Jump to search
Guild Seasons are a mechanic that were introduced in 1.20.3 . A Season will usually last around 1-2 months before a new one starts. Seasons are a competition between Guilds , and the Guilds that place the best will get several rewards.

Contents

- 1 Season Rating

- 1.1 Holding

- 1.2 Capturing

- 1.3 Seasons

- 2 Rewards

- 2.1 List of Rewards

- 2.2 List of Banner Structures

- 3 Trivia

- 4 Notes

Season Rating

Season Rating (SR) is obtained by either holding territories, or capturing them from another guild. Throughout the season, the season generation will be scaled up to allowed guilds with lower ratings to catch up. At the beginning of a new season, all territories have their owner set to a placeholder guild called Nobody [None], and each territory will have its defenses and upgrades removed, and treasury reset to very low. The season rating provided by holding and capturing are calculated using two different formulas.

Holding

The amount of season rating each territory generates is based on the number of territories that the territory owner currently owns. Territories will produce season rating every 5 seconds, and produce an hourly amount based on the following formula:

yield = ∑ i = 0 t base * s * r [ min ⁡ ( i , len ( r ) − 1 ) ]

Each variable represents the following:

- yield : Total yield of season rating generated.

- base : Hourly base amount generated (defaults to 120).

- t : Number of territories the guild owns.

- i : Current index of the iteration.

- s : Scalar applied to balance yield as season progresses.
- This value has no predetermined value, rather being manually chosen at points throughout the season.

- The scalar typically follows the following scale: 1 . 5 , 2 . 0 , 3 . 0 , 5 . 0 , 1 0 . 0 .

- r : Regression table dictating the penalty for owning higher territory counts.
- Each value is applied to the corresponding table. For instance, the 5th territory a guild owns will only yield 8 0 % of its actual generation.

- The values of the regression table can be found below.

Regression Table

Territory

Penalty

1

3.00

2

2.00

3

1.00

4

0.90

5

0.80

6, 7

0.75

8, 9

0.70

10, 11

0.65

12, 13

0.60

14, 15

0.55

16

0.50

17

0.45

18

0.40

19

0.35

20

0.30

21

0.25

22+

0.20

Capturing

Whenever your guild successfully captures a territory, you are awarded season rating based on the following formula:

awarded = base * s

Each variable represents the following:

- awarded : Total amount of awarded season rating.

- base : Amount awarded per successful capture (defaults to 40).

- s : Scalar applied to balance yield as season progresses.
- This value has no predetermined value, rather being manually chosen at points throughout the season.

- The scalar typically follows the following scale: 1 . 5 , 2 . 0 , 3 . 0 , 5 . 0 , 1 0 . 0 .

Seasons

Below is a table containing the information on the current and previous seasons.

List of Seasons

Season

Start Date

End Date

Participated

Top Guild

Top Season Rating

0

July 5th, 2021

July 7th, 2021

92

ShadowFall [Shy]

425,646

1

July 9th, 2021

September 20th, 2021

212

ShadowFall [Shy]

20,270,919

2

September 24th, 2021

November 8th, 2021

143

Emorians [ERN]

7,623,263

3

November 12th, 2021

December 23rd, 2021

146

The Aquarium [TAq]

6,508,820

4

December 27th, 2021

February 28th, 2022

154

Nefarious Ravens [NFR]

10,085,533

5

March 3rd, 2022

May 2nd, 2022

144

The Aquarium [TAq]

9,376,532

6

May 6th, 2022

July 4th, 2022

169

KongoBoys [DUDE]

8,168,698

7

July 8th, 2022

August 22th, 2022

151

Avicia [AVO]

7,326,515

8

September 12th, 2022

October 24th, 2022

216

The Aquarium [TAq]

7,409,899

9

October 28th, 2022

December 23rd, 2022

205

Avicia [AVO]

10,360,659

10

December 26th, 2022

February 20th, 2023

190

Avicia [AVO]

9,996,712

11

February 24th, 2023

April 8th, 2023

174

Avicia [AVO]

6,429,598

12

April 14th, 2023

June 11th, 2023

156

Avicia [AVO]

9,477,002

13

June 16th, 2023

August 20th, 2023

250

Avicia [AVO]

9,649,790

14

August 25th, 2023

October 29th, 2023

219

The Aquarium [TAq]

10,184,361

15

November 3rd, 2023

December 23rd, 2023

188

Idiot Co [ICo]

9,695,019

16

January 5th, 2024

February 19th, 2024

185

Sequoia [SEQ]

8,256,660

17

February 23rd, 2024

April 22nd, 2024

239

Idiot Co [ICo]

11,396,656

18

April 26th, 2024

June 17th, 2024

277

KongoBoys [DUDE]

10,651,722

19

June 24th, 2024

August 26th, 2024

444

Sequoia [SEQ]

13,480,252

20

September 1st, 2024

October 28th, 2024

418

Sequoia [SEQ]

11,786,413

21

November 1st, 2024

December 23rd, 2024

288

Sequoia [SEQ]

10,801,762

22

January 3rd, 2025

February 9th, 2025

204

Sequoia [SEQ]

10,358,368

23

February 15th, 2025

April 13th, 2025

346

Sequoia [SEQ]

14,602,939

24

April 18th, 2025

June 1st, 2025

312

Sequoia [SEQ]

11,552,721

25

June 6th, 2025

July 20th, 2025

273

Sequoia [SEQ]

12,695,257

26

July 25th, 2025

September 14th, 2025

Ongoing

Rewards

In Guild Seasons, Guilds will get rewarded based on two things, their overall position, and their Season Rating, or SR. Placing well will grant cosmetic rewards, while the amount of SR obtained will boost their guild to get more upgrades.

List of Rewards

Rating

Reward

SR Requirement

Season X - Contender Badge

1

2048 Emeralds

200

2 Public Guild Bank Slots

800

Season X - Bronze Badge

2000

Guild Cape Cosmetic [ 1 ]

4000

2 Public Guild Bank Slots

7000

Season X - Silver Badge

10000

2 Public Guild Bank Slots

15000

1 Guild Tome

20000

2048 Emeralds

30000

1 Private Guild Bank Slot

45000

2 Guild Tomes

70000

Season X - Gold Badge

100000

4096 Emeralds

140000

2 Public Guild Bank Slots

200000

3 Guild Tomes

260000

2 Private Guild Bank Slots

330000

6144 Emeralds

430000

2 Public Guild Bank Slots

540000

5 Guild Tomes

650000

Season X - Platinum Badge

760000

10240 Emeralds

880000

10 Guild Tomes

1000000

2 Public Guild Bank Slots

1200000

20480 Emeralds

1500000

2 Private Guild Bank Slots

2000000

15 Guild Tomes

2500000

2 Public Guild Bank Slots

3000000

2 Private Guild Bank Slots

3500000

30720 Emeralds

4000000

Season X - Diamond Badge

5000000

Leaderboard

Reward

Position Requirement

10% Guild XP Boost [ 2 ]

Top 200

Season X - Top 100 Badge

Top 100

Seasonal Guild Badge

Top 80

Seasonal Guild Badge

Top 50

10% Guild XP Boost [ 2 ]

Top 25

Seasonal Banner Structure

Top 20

10% Guild XP Boost [ 2 ]

Top 15

Season X - Top 10 Badge

Top 10

10% Guild XP Boost [ 2 ]

Top 5

Season X - 3rd Place Badge

Top 3

Season X - 2nd Place Badge

Top 2

Guild Crown Cosmetic [ 2 ]

Top 1

Season X - 1st Place Badge

Top 1

List of Banner Structures

-
[image: Dernic Banner Structure - Season 1 & 23]

Dernic Banner Structure - Season 1 & 23

-
[image: Light Banner Structure - Season 2 & 24]

Light Banner Structure - Season 2 & 24

-
[image: Corrupted Banner Structure - Season 3 & 25]

Corrupted Banner Structure - Season 3 & 25

-
[image: Molten Banner Structure - Season 4 & 26]

Molten Banner Structure - Season 4 & 26

-
[image: Desert Banner Structure - Season 5 & 27]

Desert Banner Structure - Season 5 & 27

-
[image: Futuristic Banner Structure - Season 6 & 28]

Futuristic Banner Structure - Season 6 & 28

-
[image: Steampunk Banner Structure - Season 7 & 29]

Steampunk Banner Structure - Season 7 & 29

-
[image: Nature Banner Structure - Season 8 & 30]

Nature Banner Structure - Season 8 & 30

-
[image: Decay Banner Structure - Season 9 & 31]

Decay Banner Structure - Season 9 & 31

-
[image: Ice Banner Structure - Season 10 & 32]

Ice Banner Structure - Season 10 & 32

-
[image: Hive Banner Structure - Season 11]

Hive Banner Structure - Season 11

-
[image: Jester Banner Structure - Season 12]

Jester Banner Structure - Season 12

-
[image: Beachside Banner Structure - Season 13]

Beachside Banner Structure - Season 13

-
[image: Otherworldly Banner Structure - Season 14]

Otherworldly Banner Structure - Season 14

-
[image: Dynasty Banner Structure - Season 15]

Dynasty Banner Structure - Season 15

-
[image: Pirate Banner Structure - Season 16]

Pirate Banner Structure - Season 16

-
[image: Harvest Banner Structure - Season 17]

Harvest Banner Structure - Season 17

-
[image: Imperial Banner Structure - Season 18]

Imperial Banner Structure - Season 18

-
[image: Musical Banner Structure - Season 19]

Musical Banner Structure - Season 19

-
[image: Candlelight Banner Structure - Season 20]

Candlelight Banner Structure - Season 20

-
[image: Clockwork Banner Structure - Season 21]

Clockwork Banner Structure - Season 21

-
[image: Tesla Banner Structure - Season 22]

Tesla Banner Structure - Season 22

List of Seasonal Guild Badges

Season

Top 80

Top 50

1

Doom

Elders

2

Warriors

High Gavellian E

3

Saviors of Orphion

Tryhards

4

Templars

Warrers of the Fruman Walls

5

Shamans

RGB Icon

6

Corkians

Horse Gamblers

7

Negotiators

Raiders

8

Relentless

Frumans

9

Archers

Merciless

10

Roleplayers

Technicians

11

Clowns

Mages

12

Voidlings

Unfazed

13

Spellmaster

Ancients

14

Dungeon Crawlers

Harvesters

15

Charitables

Blooded

16

Eternal

Cryomancers

17

Superior

Hearts of Gold

18

Stars

Ophanim

19

Orchestra

Crescendo

20

Flame

Light in the Dark

21 & 22

Timepiece

The Hourglass

23

Nameless

The Shapeless

24

Radiant

Hero of Gavel

25

Noob

The Annihilation

26

Dogun

Garaheth's Disciple

27

Tomb Raider

Master of the Sands

28

Wybel

Cosmic Horror

29

Mech Rider

Ava 's Fanclub

30

Druid

Tree Warrior

31

Parasite

Enemy of Light

32

Snowflake

Theorick's Ally

Trivia

- Season 0 is the only Guild Season that doesn't have a special Banner reward, as it was more of a 'Test Season' than a regular Season.

- In the Version 1.20.4 changelog, Guild Seasons were changed so that instead of an average Guild Season being 3 months long, now the average Guild Season should be an average of 1.5 to 2 months long, leading to overall lower ranking in later seasons.

Notes

- ↑ This reward is temporary, only lasting for the rest of the current Guild Season

- ↑ 2.0 2.1 2.2 2.3 2.4 This reward is temporary, only granting the bonus during the next season.

Retrieved from " https://wynncraft.wiki.gg/wiki/Guild_Seasons?oldid=166826 "
