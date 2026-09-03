---
id: github-com-sequoiawynncraft-sequoia-mod-blob-main-src-test-java-com-seq
url: https://github.com/SequoiaWynncraft/Sequoia-mod/blob/main/src/test/java/com/seqwawa/seq/managers/GuildAllianceSnapshotManagerTest.java
kind: repo
title: "Sequoia-mod/src/test/java/com/seqwawa/seq/managers/GuildAllianceSnapshotManagerTest.java at main · SequoiaWynncraft/Sequoia-mod · GitHub"
fetched_at: 2026-09-03T17:12:08.540Z
raw_sha256: 884676a0aad99a2b
note: "Sequoia-mod GuildAllianceSnapshotManagerTest — parses the in-game 'Sequoia: Diplomacy' menu into an authoritative ally list; fixture allies are Avicia [AVO] and Nefarious Ravens; 'Nefarious Ravens: Diplomacy' also appears as a menu title"
---

Uh oh!

There was an error while loading. Please reload this page .

SequoiaWynncraft

/

Sequoia-mod

Public

-
Notifications
You must be signed in to change notification settings

-
Fork
5

-

Star
0

-

Code

-

Issues
10

-

Pull requests
4

-

Actions

-

Projects

-

Security and quality
0

-

Insights

Additional navigation options

-

Code

-

Issues

-

Pull requests

-

Actions

-

Projects

-

Security and quality

-

Insights

Files Expand file tree

main

Breadcrumbs
- Sequoia-mod
- / src
- / test
- / java
- / com
- / seqwawa
- / seq
- / managers
/ GuildAllianceSnapshotManagerTest.java

Copy path

Blame
More file actions

Blame
More file actions

Latest commit

History
History
History

200 lines (161 loc) · 7.48 KB

main

Breadcrumbs
- Sequoia-mod
- / src
- / test
- / java
- / com
- / seqwawa
- / seq
- / managers
/ GuildAllianceSnapshotManagerTest.java

Copy path

Top

File metadata and controls
- Code

- Blame

200 lines (161 loc) · 7.48 KB

Raw
Copy raw file
Download raw file

Open symbols panel Edit and raw actions

1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
167
168
169
170
171
172
173
174
175
176
177
178
179
180
181
182
183
184
185
186
187
188
189
190
191
192
193
194
195
196
197
198
199
200

package com.seqwawa.seq.managers;

import static org.junit.jupiter.api.Assertions.assertEquals;

import static org.junit.jupiter.api.Assertions.assertFalse;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;

import java.util.Collections;

import java.util.List;

import java.util.concurrent.atomic.AtomicReference;

import net.minecraft.SharedConstants;

import net.minecraft.core.component.DataComponents;

import net.minecraft.network.chat.Component;

import net.minecraft.server.Bootstrap;

import net.minecraft.world.item.ItemStack;

import net.minecraft.world.item.Items;

import org.junit.jupiter.api.BeforeAll;

import org.junit.jupiter.api.Test;

class GuildAllianceSnapshotManagerTest {

@BeforeAll

static void bootstrapRegistries() {

SharedConstants.tryDetectVersion();

Bootstrap.bootStrap();

}

@Test

void recognizesOnlyGuildDiplomacyTitles() {

assertTrue(GuildAllianceSnapshotManager.isDiplomacyMenuTitle("Sequoia: Diplomacy"));

assertTrue(GuildAllianceSnapshotManager.isDiplomacyMenuTitle("Nefarious Ravens: Diplomacy"));

assertFalse(GuildAllianceSnapshotManager.isDiplomacyMenuTitle("Sequoia: Members"));

assertFalse(GuildAllianceSnapshotManager.isDiplomacyMenuTitle("Sequoia: Diplomacy Settings"));

assertFalse(GuildAllianceSnapshotManager.isDiplomacyMenuTitle(": Diplomacy"));

}

@Test

void waitsForPopulatedContainerContents() {

Object session = new Object();

List<List<String>> published = new ArrayList<>();

GuildAllianceSnapshotManager manager =

new GuildAllianceSnapshotManager(() -> session, snapshotPublisher(published));

manager.onMenuOpened(12, "Sequoia: Diplomacy");

assertEquals(List.of(), published);

manager.onContainerContents(12, List.of());

assertEquals(List.of(), published);

manager.onContainerContents(12, diplomacyContents(alliedGuild("Avicia", "AVO")));

assertEquals(List.of(List.of("Avicia")), published);

}

@Test

void parsesMultipleAlliedGuilds() {

List<List<String>> published = new ArrayList<>();

Object session = new Object();

GuildAllianceSnapshotManager manager =

new GuildAllianceSnapshotManager(() -> session, snapshotPublisher(published));

manager.onMenuOpened(4, "Sequoia: Diplomacy");

manager.onContainerContents(

4,

diplomacyContents(

alliedGuild("Avicia", "AVO"),

alliedGuild("Nefarious Ravens", "NRA")));

assertEquals(List.of(List.of("Avicia", "Nefarious Ravens")), published);

}

@Test

void normalizesFormattingEmbeddedInAlliedGuildNames() {

Object session = new Object();

List<List<String>> published = new ArrayList<>();

GuildAllianceSnapshotManager manager =

new GuildAllianceSnapshotManager(() -> session, snapshotPublisher(published));

manager.onMenuOpened(4, "Sequoia: Diplomacy");

manager.onContainerContents(4, diplomacyContents(namedItem("§aNefarious Ravens§b [NRA]")));

assertEquals(List.of(List.of("Nefarious Ravens")), published);

}

@Test

void sendsEmptyAuthoritativeAllianceList() {

Object session = new Object();

List<List<String>> published = new ArrayList<>();

GuildAllianceSnapshotManager manager =

new GuildAllianceSnapshotManager(() -> session, snapshotPublisher(published));

manager.onMenuOpened(7, "Sequoia: Diplomacy");

manager.onContainerContents(7, diplomacyContents());

assertEquals(List.of(List.of()), published);

}

@Test

void removesCaseInsensitiveDuplicates() {

Object session = new Object();

List<List<String>> published = new ArrayList<>();

GuildAllianceSnapshotManager manager =

new GuildAllianceSnapshotManager(() -> session, snapshotPublisher(published));

manager.onMenuOpened(7, "Sequoia: Diplomacy");

manager.onContainerContents(

7,

diplomacyContents(

alliedGuild("Avicia", "AVO"),

alliedGuild("avicia", "AVO"),

alliedGuild("Nefarious Ravens", "NRA")));

assertEquals(List.of(List.of("Avicia", "Nefarious Ravens")), published);

}

@Test

void sendsOnlyOncePerMenuOpening() {

Object session = new Object();

List<List<String>> published = new ArrayList<>();

GuildAllianceSnapshotManager manager =

new GuildAllianceSnapshotManager(() -> session, snapshotPublisher(published));

List<ItemStack> contents = diplomacyContents(alliedGuild("Avicia", "AVO"));

manager.onMenuOpened(3, "Sequoia: Diplomacy");

manager.onContainerContents(3, contents);

manager.onContainerContents(3, contents);

assertEquals(List.of(List.of("Avicia")), published);

manager.onMenuOpened(3, "Sequoia: Diplomacy");

manager.onContainerContents(3, contents);

assertEquals(List.of(List.of("Avicia"), List.of("Avicia")), published);

}

@Test

void doesNotSendIncompleteOrMalformedContents() {

Object session = new Object();

List<List<String>> published = new ArrayList<>();

GuildAllianceSnapshotManager manager =

new GuildAllianceSnapshotManager(() -> session, snapshotPublisher(published));

manager.onMenuOpened(5, "Sequoia: Diplomacy");

manager.onContainerContents(5, List.of(ItemStack.EMPTY));

manager.onContainerContents(5, diplomacyContents(namedItem("Loading...")));

assertEquals(List.of(), published);

}

@Test

void doesNotSendWithoutTheOpeningAuthenticatedSession() {

AtomicReference<Object> session = new AtomicReference<>();

List<List<String>> published = new ArrayList<>();

GuildAllianceSnapshotManager manager =

new GuildAllianceSnapshotManager(session::get, snapshotPublisher(published));

List<ItemStack> contents = diplomacyContents(alliedGuild("Avicia", "AVO"));

manager.onMenuOpened(9, "Sequoia: Diplomacy");

session.set(new Object());

manager.onContainerContents(9, contents);

assertEquals(List.of(), published);

Object openingSession = new Object();

session.set(openingSession);

manager.onMenuOpened(10, "Sequoia: Diplomacy");

session.set(null);

manager.onContainerContents(10, contents);

session.set(new Object());

manager.onContainerContents(10, contents);

assertEquals(List.of(), published);

}

private static GuildAllianceSnapshotManager.SnapshotPublisher snapshotPublisher(

List<List<String>> published) {

return guildNames -> {

published.add(guildNames);

return true;

};

}

private static List<ItemStack> diplomacyContents(ItemStack... allies) {

List<ItemStack> contents = new ArrayList<>(Collections.nCopies(9, ItemStack.EMPTY));

for (int index = 0; index < allies.length; index++) {

contents.set(index + 2, allies[index]);

}

return contents;

}

private static ItemStack alliedGuild(String guildName, String tag) {

return namedItem(guildName + " [" + tag + "]");

}

private static ItemStack namedItem(String name) {

ItemStack stack = new ItemStack(Items.PLAYER_HEAD);

stack.set(DataComponents.CUSTOM_NAME, Component.literal(name));

return stack;

}

}
