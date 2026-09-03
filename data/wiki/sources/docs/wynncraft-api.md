---
id: wynncraft-api
url: https://api.wynncraft.com/v3/
kind: api
title: "Wynncraft official API (v3)"
fetched_at: 2026-09-03T21:26:30.521Z
note: "The game's own API: guild creation dates, current rosters, owners and chiefs, territory holdings, season ratings and player records. Authoritative for the present, silent about the past."
---
# Wynncraft official API (v3)

The game's own public API. The wiki uses it for guild records
(`/v3/guild/<name>`), the live territory list (`/v3/guild/list/territory`) and
player records (`/v3/player/<name-or-uuid>`).

## What it is good for

Guild creation dates, current ownership and rank structure, member counts, total
wars, season ratings and current territory holdings. Where an article states a
guild's founding date, it usually rests on this.

## What it cannot support

The API describes the present. It carries **no history**: no former members, no
past owners, no record of alliances — the v3 guild endpoint has no alliance field
at all. A guild that was renamed reads as though it always had its current name,
and a guild that disbanded and was re-registered shows the later creation date with
nothing to indicate the break.

That last point caused a real confusion in this wiki: the Kingdom Foxes guild in
the API dates to 3 July 2016, which is one day after the 2015 guild of that name
was disbanded — the API cannot tell you that, and the explanation had to come from
a participant's account.

Individual captured responses are archived separately, each as its own reference,
so a claim cites the state of the record at the moment it was read.
