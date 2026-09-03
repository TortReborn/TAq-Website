---
name: chronicle-article
description: Write and revise articles in the Chronicles wiki (Wynncraft guild history). Use when creating a new chronicle article, revising an existing one, or propagating a corrected fact across articles. Encodes the project's Wikipedia-style voice, section order, sourcing and citation rules.
---

# Writing Chronicles articles

The Chronicles wiki documents Wynncraft guild warfare, 2014–2026. It is written
to Wikipedia's conventions, **shorter than Wikipedia writes**, and every claim is
sourced.

Two absolute rules, in tension, and both hold:

1. **Nothing is invented.** No plausible dates, rosters, causes or motives. If it
   is not in a source, it does not go in the article.
2. **The prose does not talk about its own sources.** Provenance lives in the
   footnote, not the sentence. This is what makes the wiki readable.

Rule 2 is the one that gets broken. The corpus was drafted under an older guide
that said to label every non-attested claim in prose, which buried the history
under a running commentary about where we got it. Wikipedia does not do this, and
neither do we any more.

## The attribution test

Before writing "according to", "X states that", "by his account", "the record
shows", "a Wayback capture of", apply this test:

> Delete the attributing phrase. Does the reader lose anything that the footnote
> does not already tell them?

Almost always: no. Then delete it.

```
BAD   By that account LoveLusting disbanded the Kingdom of Foxes on 2 Jul 2016.{{cite:drew1011-storytime|part 8}}
GOOD  LoveLusting disbanded the Kingdom of Foxes on 2 July 2016.{{cite:drew1011-storytime|part 8}}

BAD   A recovered Wayback capture of the guild leaderboard from 23 September 2016
      shows Hax holding 146 of roughly 332 held territories.{{cite:pre2018-territory-snapshots|23 Sep 2016}}
GOOD  In September 2016 HackForums held 146 of roughly 332 held territories.{{cite:pre2018-territory-snapshots|23 Sep 2016}}
```

**Attribute in prose in exactly four cases**, where the attribution is itself the
information:

| Case | Example |
|---|---|
| Opinion, judgement or characterisation | *Titan Times called the bloc "the greatest super-alliance of 2023".* |
| Sources genuinely disagree, and the disagreement is the content | *The community timeline dates the merger to 24 December; participants recall a Christmas Day wipe followed by a February merger.* |
| An interested party describing their own conduct | *Drew1011 wrote that the merger was his own proposal.* |
| A direct quotation | *He called the name "a joke".* |

Everything else is stated flatly and footnoted.

## Uncertainty is content, but it is a fact about the past

Keep the gaps — they are some of the wiki's most valuable sentences. Write them
as facts about the historical record, never as remarks about our research.

```
BAD   The cause is recorded in no source held here.
BAD   An earlier version of this article recorded that the date was undocumented.
BAD   No other public guild-history facts about the player are in the chronicle's sources.
GOOD  The cause of the disbandment was never recorded.
GOOD  Which side prevailed is not known.
GOOD  The roster was never published.
```

Never mention the archive, the corpus, the chronicle database, an earlier
revision, or our own research process. That is talk-page material.

## When the evidence really is the story

Where a whole article rests on one contested account, do not smear caveats
through the narrative. Quarantine them in a short `## The record` section — the
move Wikipedia makes with the "Primary sources" section of *Second Punic War* and
"Historic sources" of *Peloponnesian War*. One paragraph naming the account, when
it was written, and what it is weak on. Then narrate flatly, and footnote.

Use it sparingly: era articles, and articles where a single retrospective is the
only witness. Most articles need no such section.

## Reference files

| File | Read it when |
|---|---|
| `references/voice.md` | Writing or revising prose — the full voice rules with worked before/after pairs from this corpus |
| `references/structure.md` | Deciding sections, order, lede and infobox for a page type |
| `references/citations.md` | Citing, choosing sources, weighing tiers |
| `references/updating.md` | A fact changed and several articles repeat it |

## Workflow A — a new article

1. **Gather before drafting.** Search the local archive first; only hit the
   network for something genuinely missing, and archive what you fetch.
   ```bash
   node scripts/source-archive.mjs search "Valkyrie"
   node scripts/source-archive.mjs list
   node scripts/source-archive.mjs show thread-237070
   ```
2. **Check the chronicle database**, which is ground truth for dates, alliances,
   memberships and events. An article may not contradict it. If the article's
   evidence contradicts the database, stop and fix the database first
   (`references/updating.md`).
3. **Pick the skeleton** for the page type from `references/structure.md`. Drop
   any section you have no sourced material for — never write a heading in order
   to fill it.
4. **Draft the lede**, then the body. Follow the word budgets; a thin record
   means a short article, never padding.
5. **Check it:**
   ```bash
   node scripts/check-article-style.mjs --slug <slug>
   node scripts/check-citations.mjs --slug <slug>
   ```
6. Seed it: `node scripts/seed-wiki-articles.mjs`.

## Workflow B — a fact changed

Corrections arrive constantly (a new source, a capture-log check, a corrected
membership date), and the same fact is usually stated in five articles. Follow
`references/updating.md`. In short:

1. Fix the **chronicle database first** if the fact lives there, with an audit row.
2. `node scripts/check-article-style.mjs --fact "<old date or claim>"` to find
   every article repeating it.
3. Update each hit, including infoboxes and ledes, not just body prose.
4. Where a claim was **refuted**, record it in
   `data/wiki/research/analyses/` so nobody re-proposes it.
5. Re-run both checkers, re-seed, and verify dev and prod match.

## Before you call it done

```bash
node scripts/check-article-style.mjs --strict   # voice, structure, length
node scripts/check-citations.mjs --strict       # every citation resolves
npm test
```

Then read the article top to bottom once. The linter catches phrasings; it cannot
tell you whether the history is clear.
