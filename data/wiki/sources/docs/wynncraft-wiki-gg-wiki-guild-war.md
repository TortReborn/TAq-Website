---
id: wynncraft-wiki-gg-wiki-guild-war
url: https://wynncraft.wiki.gg/wiki/Guild_War
kind: wiki
title: "Guild War - Official Wynncraft Wiki"
fetched_at: 2026-09-03T17:11:48.935Z
raw_sha256: 7801f778fb75ce22
note: "Wynncraft wiki Guild War page — documents the in-game Diplomacy system (ally tax rates, alliance/enemy status) that replaced private-Discord diplomacy; the mechanical backbone of the 2023-2026 era"
---

Guild War

From Wynncraft Wiki

Jump to navigation
Jump to search
Guild Wars are one of the endgame activities in Wynncraft , requiring to be part of a guild , which consists of a territory capture game across the map. These territories can have upgrades that impact the real map, and is the main way of aquiring Guild tomes .

Contents

- 1 Territories

- 1.1 Resources

- 2 Attacking

- 2.1 Queuing

- 2.2 Warring

- 3 Defending

- 4 Economy

- 4.1 Guild Headquarters

- 4.2 Upgrades

- 4.3 Bonuses

- 5 Glossary

- 5.1 Warring

- 5.2 Territories

- 5.3 Community

Territories

As of 1/24 Patch , there are 406 territories all around the map. These are divided into territory types and the resource they produce.

Territory types

Type

Description

Count

Single

Have base resource productions. Most common, produces 9000 emeralds and 3600 of a resource.

374

Town

Located on most cities. Produces 2x the amount of emeralds.

19

Oasis

Produce all resources at a reduced yield of 0.25x, and produces 0.20x the emeralds.

20

Double

Located on places around the map. Produces 2x of their resource.

13

Multigen

Maltic Coast generates both fish and crop at the normal rate.

1

Territories are the main pieces of warring.

Resources

Resources are a integral part of economy within guilds, being used to purchase upgrades and bonuses on territories. There are five resources, being:

-
Emeralds (not to be confused with Emeralds )

-
Ore

-
Wood

-
Fish

-
Crop

These resources are needed to sustain upgrades and bonuses on territories.

Resource types

Type

Description

Related Upgrades

Number of territories

Emeralds

Every territory produces emeralds. Cities produce double the emeralds.

XP Seeking, Larger Resource Storage, Efficient Resources, Resource Rate

406

Wood

Most common, territories are mostly condensed in central Gavel

Tower HP, Stronger Minions, Gathering Experience, Emerald Seeking, Larger Emerald Storage.

146

Ore

Commonly found in Canyon of the Lost territories, and condensed in mining related spots.

Tower Damage, Tower Volley, PVP damage, Efficient Emeralds.

131

Crop

Commonly found in the Wynn Province, with the most amount of double territories.

Tower Attack Speed, Tower Aura, Mob Damage, Emerald Rate.

113

Fish

Least common resource. Located near bodies of water.

Tower Defense, Tower Multi-Attacks, Mob Experience, Tome Seeking,

77

Attacking

Attacking territories consists of fighting the Guild Tower, which will deal constant damaging attacks, which cannot be avoided, towards the nearest player until it dies.

Queuing

To attack (or to queue) a territory, use the /guild attack command within the territory you want to attack to open the attack menu. The attack menu shows the territory difficulty, cost, and timer, as well as the route the timer is calculated on, and left clicking will spend emeralds to start the timer. If another guild captures the territory during this timer, your attack is cancelled and the emeralds are refunded. If the timer finishes, up to five random guild members within the territory will be teleported into the Guild Arena, which is an arena with the Guild Tower , a large tower boss that must be defeated to take control of the territory from the controlling guild. Players can opt out by using the /toggle war command. When entering a war, players will have a 25 second grace period in which they can move around and prepare for the fight.

For a guild with territories to begin a war, the following conditions must be met:

- The territory must not have been captured by another guild in the last 10 minutes .

- The territory must not be owned by the attacking guild.

- The attacking guild must have a headquarters.

- The attacking guild must have a valid route to the attacked territory.

- The attacking guild must have sufficient emeralds for the attack.

- The attacking guild must not have an active timer on the territory for any less than 20 minutes.
- If the timer on the territory exceeds 20 minutes, it is possible to attack the territory a second time.

- Additional timers will be cancelled and refunded if previous attacks are successful.

If these conditions are met, a guild may attack the territory. Guilds that do not have any territories may begin a war at no cost.

Base Attack Costs

Territories Owned

Emeralds Required

0

Free

1

200

2

800

3

2000

4+

4000

When starting an attack, the tax rate of the territories between your headquarters and the territory being attacked will increase the cost. This increased cost can be calculated using the following formula:

cost = ( 1 + t 1 ) r 1 * ( 1 + t 2 ) r 2 * … * ( 1 + t n ) r n

Each variable represents the following:

- cost : Total cost of attacking the territory after taxation.

- t n : Individual occurrence of tax rate along the route.

- r n : Number of occurrences of tax rate in t n

To note, this formula excludes territories owned by you, and will use the relevant tax rate based on your diplomacy with the territory owner. For instance, guilds in which you have an alliance with will tax you for the ally tax of that territory.

When passing through another guild's territory, the cost to start a war is increased due to tax. However, you don't have to pay the guild you're attacking any tax. Note that the extra emeralds a guild pays due to tax get removed from the system.

As an example, a guild originally paying 4000 emeralds, will pay 4200 emeralds instead if they pass through a territory with a 5% tax.

Warring

After the 25 second grace period, the Guild Tower will begin attacking the player nearest to the tower, attacking the targetted player for a value between the minimum tower damage and double the maximum tower damage, and hits at a rate based on the tower attack speed. Players in the war are shown the stats of the tower in the form of a bossbar, which consists of the guild that currently owns the territory, the territory name, the health and defense of the tower, the minimum and maximum damage range of the tower, and the attacks per second of the tower.

[image: An example of a Guild Tower bossbar]

The Guild Tower has the following stats, although do note that each stat has an independent upgrade level:

Guild Tower Stats

Upgrade level

Health

Defense

Damage

Attack Speed

Level 0

300000

10%

1000-1500

0.5x

Level 1

450000

40%

1400-2100

0.75x

Level 2

600000

55%

1800-2700

1.0x

Level 3

750000

62.5%

2200-3300

1.25x

Level 4

960000

70%

2600-3900

1.61x

Level 5

1200000

75%

3000-4500

2.0x

Level 6

1500000

79%

3400-5100

2.5x

Level 7

1800000

82%

3800-5700

3.0x

Level 8

2160000

84%

4200-6300

3.6x

Level 9

2280000

86%

4600-6900

3.8x

Level 10

2580000

88%

5000-7500

4.2x

Level 11

2820000

90%

5400-8100

4.7x

The guild tower also receives a stat boost based on the amount of nearby owned territories, with a +30% bonus to damage and health for connected territory that is owned.

stat * ( 1 . 0 + ( 0 . 3 * connections ) )

Players are targetted by the tower until they either die, exit the center half of the arena, or leave the war, in which case the tower will target the next closest player. Your guild will capture the territory if the tower's health reaches zero, and the territory will go on cooldown for 10 minutes , preventing other guilds' attacks. Your guild will fail to capture the territory if all players die or leave the war. You may leave through the lobby or /switch . Wars do not allow for most commands, such as /class and /trade , so it is recommended trading items is done before the war begins.

There are a number of abilities and effects that affect the Guild Tower. As a general rule, any effects that provides a status effect that buff player resistance, or lower enemy damage have no effect on the Guild Tower, as the Guild Tower's damage is considered environmental.

Throughout the Guild War, mobs will spawn from the Guild Tower, and will later spawn more and more as a war progresses. The Tower will also use Tower Aura or Tower Volley at intervals, which are strong true damage attacks that can be avoided by not being in the range.

Defending

Applying defenses to territories owned by your guild can be done using /guild manage (shortcut /gu manage ) and accessing the territory menu.

Upgrades

- Damage: Increases the minimum and maximum damage the tower deals to players. Costs ore.

- Attack: Increases the tower's attacks per second. Costs crop.

- Health: Increases the tower's health. Costs wood.

- Defense: Increases the tower's resistance to player attacks. Costs fish.

- All 4 upgrades can be maxed out at level 11.

Offensive Bonuses

- Stronger Mobs: Increases the damage mobs deal to the player in the war. Costs wood.

- Multi-Attack: Allows the tower to target an additional player (2 total). Costs fish. This upgrade can only be placed on a maximum of 5 territories

- Aura: Releases a wave of fire particles that descend down the tower to the floor of the arena then travel halfway to the edge of the arena. Any player that touches aura particles is dealt 100%-200% of the tower's damage as true damage. Aura can be dodged by standing in the back half of the arena, or by jumping at least 1.5 blocks off the ground. Costs crop.

- Volley: Launches a volley of particles that fly to the outer half of the arena and explode, dealing 100%-200% of the tower's damage as true damage. Volley can be dodged by standing in the center half of the arena, or by jumping around 4 blocks off the ground. Costs ore.

Economy

Resources traverse to their destination through the use of packages, which are the resources produced by a territory or sent by the guild headquarters. Packages traverse through special storages in each territory, which can hold an unlimited number of resources, and travel along a route calculated when sent from the origin territory. The route of a package cannot be changed after it has begun traversing, and any changes to tax along the route will still be applied.

Every 60 seconds, the map will have a traversal tick , where all packages will move to the next territory on their route. Traversing resources may only be interacted with in two ways:

- The package arrives at it arrives at its destination, in which case they are added to the destination territory's storages.

- The territory the package is traversing through is captured, transferring the package into the capturing guild's headquartes on the next traversal tick.
- Captured packages are added to the headquarters traversals as a package, and have their destination territory set as themselves.

When calculating the route to the destination territory, if the route tax total exceeds 99.95%, the territory will not send any resources. Production territories will stop creating packages to traverse if the guild has no headquarters, and any currently traversing resources will continue to their destination, regardless of the owner.

Guild Headquarters

A guild's headquarters is the territory assigned by a guild to store and distribute resources and emeralds to all of that guild's territories to pay for upgrades and bonuses. All resources and emeralds produced by territories that guild owns will traverse towards the headquarters according to the routing type of the territory that produced the resources, and all resources and emeralds distributed by the headquarters to supply territory costs will traverse towards the destination territory according to the headquarters' routing type. Headquarters routing also applies to attacking, seeking the shortest timer on fastest, and the lowest attack cost on cheapest. The headquarters receives a higher base storage for resources and emeralds, being able to store 1500 of each resource and 5000 emeralds with no upgrades, and being able to store up to 120000 resources and 400000 emeralds with maxed upgrades.

Headquarters receives the normal +30% connection bonus to damage and health that all territories receive, as well as an additional bonus of +25% damage and health for each territory owned by the guild within 3 connections of the headquarters, with these territories being called externals . The bonus given by externals defaults to +50% with no externals owned, and also includes direct headquarters connections that are used in the connection bonus. Externals do not require the territories between itself and the headquarters to be owned for them to be used in the calculation. To calculate the damage and health of a headquarters, the following formula can be applied: stat * ( 1 . 5 + ( 0 . 2 5 * externals ) ) * ( 1 . 0 + ( 0 . 3 * connections ) )

Upgrades

Upgrades are buffs that can be set on the guild tower of a territory at the expense of resources. They provide raw stat bonuses to damage, attack speed, health and defense.

Upgrade Levels

Upgrade

Level 1

Level 2

Level 3

Level 4

Level 5

Level 6

Level 7

Level 8

Level 9

Level 10

Level 11

Stat Boosted

Damage

+40%

+80%

+120%

+160%

+200%

+240%

+280%

+320%

+360%

+400%

+440%

Damage

Attack

+50%

+100%

+150%

+220%

+300%

+400%

+500%

+620%

+660%

+740%

+840%

Attacks per Second

Health

+50%

+100%

+150%

+220%

+300%

+400%

+500%

+620%

+660%

+740%

+840%

Tower Health

Defence

+300%

+450%

+525%

+600%

+650%

+690%

+720%

+740%

+760%

+780%

+800%

Defence

Upgrade Resource Costs

Upgrade

Level 1

Level 2

Level 3

Level 4

Level 5

Level 6

Level 7

Level 8

Level 9

Level 10

Level 11

Resource

Damage

100

300

600

1200

2400

4800

8400

12000

15600

19200

22800

Ore

Attack

100

300

600

1200

2400

4800

8400

12000

15600

19200

22800

Crops

Health

100

300

600

1200

2400

4800

8400

12000

15600

19200

22800

Wood

Defence

100

300

600

1200

2400

4800

8400

12000

15600

19200

22800

Fish

Bonuses

Bonuses are buffs that can be set on Territories at the expense of resources and emeralds. They provide abilities for the guild tower, Mob damage, PVP damage, gathering and combat XP boosts for the owning guild's members, and can boost resource and emerald generation.
The bonuses also include Seeking Upgrades, which give out either Guild XP, Emeralds or Guild Tomes.

Bonus Costs

Bonus

Level 0 (Default)

Level 1

Level 2

Level 3

Level 4

Level 5

Level 6

Level 7

Level 8

Level 9

Level 10

Bonus Upgrade

Resource

Stronger Minions

+0%

+150%

+200%

+250%

+300% (Max)

Minion Damage

Wood

Tower Multi-Attacks

1 Max Target

2 Max Targets (Max)

Max Targets

Fish

Tower Aura

0s (Disabled)

24s

18s

12s (Max)

Frequency

Crops

Tower Volley

0s (Disabled)

20s

15s

10s (Max)

Frequency

Ore

Gathering Experience

+0%

+10%

+20%

+30%

+40%

+50%

+60%

+80%

+100% (Max)

Gathering XP

Wood

Mob Experience

+0%

+10%

+20%

+30%

+40%

+50%

+60%

+80%

+100% (Max)

XP Bonus

Fish

Mob Damage

+0%

+10%

+20%

+40%

+60%

+80%

+120%

+160%

+200% (Max)

Damage Bonus

Crops

PvP Damage

+0%

+5%

+10%

+15%

+20%

+25%

+40%

+65%

+80% (Max)

Damage Bonus

Ore

XP Seeking

+0/h

+36000/h

+66000/h

+120000/h

+228000/h

+456000/h

+900000/h

+1740000/h

+2580000/h

+3360000/h

Guild XP

Emeralds

Tome Seeking

0%/h

0.15%/h

1.2%/h

2.4%/h (Max)

Drop Chance

Fish

Emerald Seeking

0%/h

0.3%/h

3%/h

6%/h

12%/h

24%/h (Max)

Drop Chance

Wood

Larger Resource Storage

+0%

+100%

+300%

+700%

+1400%

+3300%

+7900% (Max)

Storage Bonus

Emeralds

Larger Emerald Storage

+0%

+100%

+300%

+700%

+1400%

+3300%

+7900% (Max)

Storage Bonus

Wood

Efficient Resources

+0%

+50%

+100%

+150%

+200%

+250%

+300% (Max)

Gathering Bonus

Emeralds

Efficient Emeralds

+0%

+35%

+100%

+300% (Max)

Emerald Bonus

Ore

Resource Rate

4s

3s

2s

1s (Max)

Gather Rate

Emeralds

Emerald Rate

4s

3s

2s

1s (Max)

Gather Rate

Crops

Glossary

Below is a list of commonly used terms and phrases used within guilds.

Warring

HQ
Abbreviation of guild headquarters.
DPS
1. The damage per second dealt by players within a war.
2. The role of dealing damage in a war, typically in a team
Tank
The role of tanking damage in a war, typically in a team.
Healer
The role of healing other players in a war, typically in a team.
Solo
Player participating in a war by themselves.
Duo, 2Man
Group of two players who participate in a war.
Trio, 3Man
Group of three players who participate in a war.
4Man
Group of four players who participate in a war.
5Man
Group of five players who participate in a war.
Warteam, Team
General term for a group of people participating in a war.
HQ Team
Group of warrers who focus on taking a guild headquarters.
B Team
Group of warrers who focus on taking externals, critical resources, chokeholds, or towns.
Consu
Short for consumables.
Territories

Terr
Short for territory
Conn
Also known as Proxy
Short for connection. A number beforehand dictates the number of connections.
Ext, Pseudo, Pseudoconnection
Short for external. A number beforehand dictates the number of externals.
Tres
Short for treasury.
Def
1. Short for defense.
2. The process of defending territories.
Undef
The process of undefending territories.
Buff
The process of increasing the defenses on a territory.
Eco, Ecoing
The process of fixing or changing the guild's economy.
Res
Short for resources.
Voiding, Voided
The deletion of resources, either when a territory generates more with full storages, or an amount greater than the storages of a territory arrives at that territory.
Choke, Chokehold
The territory in which a large number of resources are required to flow into.
Draining
The process of draining resources by restricting the amount of resource input into a guild headquarters.
Where the output of the headquarters exceeds the input, either due to being
Tribs
Short for tributes.
Emes
Short for emeralds in a territory.
Eme Seeking, Em Seek
Not to be confused with emeralds
Short for emerald seeking upgrade.
X/X/X/X
Dictates the upgrade levels for each of the territory upgrades in order of damage, attack, health, defense.
For instance, 5/7/5/5 would indicate Damage 5, Attack 7, Health 5, Defense 5.
Nx4
Dictates that a territory has level N on each of the territory upgrades.
For instance, 11x4 would dictate that each upgrade of the territory is level 11.
Vlow
Short for very low defense or treasury.
Med
Short for medium defense or treasury.
Vhigh
Short for very high defense or treasury.
Multi
Short for multi-attack.
Aura
Short for tower aura.
Volley
Short for tower volley.
Snipe, Sniping
Taking a guild headquarters.
Typically used in the context of only taking connections before taking the headquarters.
Drysnipe, Dry
Not to be confused with sniping
Taking a guild headquarters without taking any connections or externals.
Snake, Snaking
Moving your guild headquarters to your most recently taken territory to prevent it from being attacked.
CD
Abbreviation of cooldown.
Wipe
When a guild has lost all the territories it owns.
Queue
Often abbreviated as simply " q "
Synonymous with starting an attack on a territory.
Timer
Time until a war begins.
Community

Raid
Not to be confused with Raids
A coordinated attack on a guild or region.
Claim
The area in which a guild owns.
FFA
Abbreviation of free for all, which are areas decided by guilds with claims to practice warring or to gain additional season rating.
Note that free for alls are not officially recognised
Defender
Guild that actively holds a claim.
Attacker
Guild that solely focuses on attacking claims.
BT, NN, MBP, CO...
Abbreviations of Territory names, typically where a guild headquarters is placed. Some territory abbreviations may conflict.
BT: Bloody Trail or Bandit Toll, NN: Nodguj Nation, MBP: Mine Base Plains, CO: Cinfras Outskirts

Retrieved from " https://wynncraft.wiki.gg/wiki/Guild_War?oldid=146071 "

Category : - Core Mechanics
