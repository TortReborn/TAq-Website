# Updating facts across the chronicle

A correction is rarely confined to one article. A membership date appears in the
alliance article, in both guild articles, in the era survey, in an infobox and in
a lede. The failure mode is fixing the prose in one place and leaving four stale
copies behind.

## Order of operations

**1. Fix the database first**, if the fact lives there. The chronicle database is
ground truth for alliances, memberships, events and dates; articles may not
contradict it. Apply to dev and prod together, with an audit row recording the
evidence.

**2. Find every article repeating it.**

    node scripts/check-article-style.mjs --fact "15 Mar 2018"

The `--fact` search normalises date forms, so `2018-03-15` also matches
"15 March 2018", "15 Mar 2018" and "March 15, 2018".

**3. Update every hit** — body prose, `## Alliances` lists, infobox rows and the
lede. Ledes and infoboxes are the ones that get missed.

**4. Check the neighbours.** A changed date often invalidates a *relative* claim
somewhere else: "shortly after joining", "the alliance's last member to leave",
"by then the bloc had six members". Grep the affected guild and alliance names,
not only the date.

**5. Record refutations.** When evidence *refutes* a proposed change, write it up
in `data/wiki/research/analyses/` with the method and the numbers. Refuted
inferences come back otherwise: five of nine proposed Federation departures
survived checking, and that write-up is what stops the other four returning.

**6. Re-verify.**

    node scripts/check-article-style.mjs --strict
    node scripts/check-citations.mjs --strict
    node scripts/seed-wiki-articles.mjs
    npm test

Then confirm dev and prod agree.

## Weighing a proposed correction

New testimony is not automatically an upgrade on the existing record. Before
rewriting a date:

- Prefer a **contemporaneous** record over a recollection.
- Check it against the **capture log** where the period allows (2018 onward).
  Absence from a document is weak evidence; the exchange record usually turns it
  into a strong answer either way.
- Watch for the trading signature: **high-volume, near-symmetric exchange between
  two guilds means they were allies trading territory, not fighting.** BuildCraftia
  looked expelled in March until the log showed 1,157 captures taken against 1,158
  lost in April, almost all against fellow members.
- If it stays ambiguous, **leave the recorded date alone** and note the case as
  unresolved. A manufactured date is worse than an open question.

## Revising an existing article to these rules

The usual work, in order:

1. Strip in-prose attribution down to the four cases in `voice.md`.
2. Delete meta-commentary about our sources, the archive, or earlier revisions.
3. Re-cut the lede to one to three sentences that define and place the subject.
4. Reorder sections to the `structure.md` skeleton; drop the empty ones.
5. Flatten infobox values to single facts.
6. Trim to the word budget, cutting editorial connective tissue first and facts
   last.

Citations survive all of this. When a sentence's prose attribution is removed,
**the citation stays exactly where it was** — that is the whole point of the
change.
