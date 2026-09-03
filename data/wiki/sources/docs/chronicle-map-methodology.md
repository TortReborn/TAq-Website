---
id: chronicle-map-methodology
url: 
kind: internal-record
title: "Chronicle map-data methodology notes"
fetched_at: 2026-09-03T21:26:30.521Z
note: "The method used to distinguish real wars from free-for-all trading in the exchange log, and to infer alliance activity windows. Recorded with the draft change sets in data/chronicle/drafts/."
---
# Chronicle map-data methodology notes

The reasoning behind alliance and event entries that were derived from the
territory-exchange log rather than from a written source, kept alongside the draft
change sets they justify.

## The core problem

Raw exchange counts do not distinguish a war from routine churn. Certain territory
clusters are contested continuously by guilds with no hostility between them —
free-for-alls that generate enormous volume. An early pass at this record mistook
that churn for warfare, and the correction is why the method below exists.

## The method

1. For a given window, rank territories by exchange volume and set aside the
   highest-churn set as free-for-all activity.
2. Look for sustained fighting across the *remaining* quiet territories. A real war
   shows up as many ordinarily-peaceful territories changing hands repeatedly
   between the same two groups.
3. Distinguish war from alliance trading by symmetry and location: allies trade
   high volume on hot territories in a near-even exchange; enemies fight across
   quiet ground, often with one side losing net holdings over time.
4. Treat the resulting bloc boundaries as *inference*. Guild pairs can be
   established this way; alliance names and rosters cannot, and are never invented
   from map data.

## Standing caution

Where an article's claim rests on this method, the prose says so — "map-data
analysis places the war's start near..." — and it is never presented as though a
source had recorded it.
