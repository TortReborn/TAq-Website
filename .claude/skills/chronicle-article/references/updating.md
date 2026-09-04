# Updating — when a fact changes

Corrections arrive constantly: a newly archived thread, a capture-log check, a
corrected membership date, a refuted inference. The same fact is usually stated
in several articles, plus a lede, plus an infobox, plus the chronicle database.
A correction that touches only the paragraph you happened to be reading is worse
than none — the wiki then disagrees with itself.

## Order of operations

1. **Check `data/wiki/research/analyses/` first.** If the "new" fact was already
   investigated and refuted, stop — do not re-propose it. If the analyses
   support the change, proceed.

2. **Fix the chronicle database before any article**, if the fact lives there
   (dates, memberships, alliance records, events). The database is ground truth;
   articles must not contradict it, so an article corrected ahead of the
   database is a contradiction you just created. Record the reasoning in an
   audit row / research note, not in article prose.

3. **Find every statement of the old fact:**
   ```bash
   node scripts/check-article-style.mjs --fact "10 November 2018"
   ```
   `--fact` searches bodies, summaries, infobox values and titles,
   case-insensitively, and prints every article containing the string. Search
   both prose forms of a date (`10 November 2018` and `10 Nov 2018`) and any
   distinctive phrase that repeats the claim. Check the drafts under
   `data/chronicle/drafts/` too when the fact originated there.

4. **Update every hit** — body prose, ledes, infobox rows, `{{war-chart:...}}`
   windows and `{{map:...}}` dates, not just the paragraph that prompted the
   correction. Re-read each touched paragraph; a date change often invalidates
   a neighbouring "five days later".

5. **If a claim was refuted**, write it down in
   `data/wiki/research/analyses/<topic>.md`: the claim, the evidence against
   it, and the check that killed it. This is what stops it being re-proposed by
   the next drafting session. Do not mention the refutation in article prose —
   the article simply states what is now believed true.

6. **Verify and re-seed:**
   ```bash
   node scripts/check-article-style.mjs --strict
   node scripts/check-citations.mjs --strict
   node scripts/check-fact-drift.mjs              # see below — required after a bulk pass
   node scripts/seed-wiki-articles.mjs --dry-run
   node scripts/seed-wiki-articles.mjs --dev      # then --prod once verified
   ```
   The seeder is idempotent: existing slugs get a new revision, never a
   duplicate page.

## After a bulk rewrite: check for drift

A style pass is supposed to change wording only. Across many articles that is
impossible to eyeball, so diff the facts:

```bash
node scripts/check-fact-drift.mjs                # against HEAD
node scripts/check-fact-drift.mjs --rev <sha>    # against any revision
```

It reports every date, figure, citation and wiki link that appeared or vanished,
and separately flags **dropped source disagreements** — the class a
de-attribution pass is most likely to eat, because a sentence saying "the
timeline gives 14 December, Drew1011 gives the 21st" looks exactly like the
attribution the pass is there to remove. It is one of the four cases that keeps
its attribution, and it must survive.

Every line it prints is either a deliberate correction or a mistake; the script
cannot tell them apart, so check each one. Expect some false positives — a
sentence rewritten tightly enough will look deleted, and image-filename hashes
look like figures. That is the right failure mode for a safety net.

Typical benign findings after a real pass: numbers that were thread metadata
(view counts, sweep totals), dates that were archive mechanics ("captured on
30 January 2024"), and wiki links lost because the sentence naming the source
was cut. Anything else deserves the article opened.

## What a correction does NOT leave behind

- No "an earlier version of this article said…" — revision history exists for
  that.
- No "recent research shows…" / "it has since emerged…" — the article states
  the corrected fact as if it had always been known, footnoted to the new
  source.
- No orphaned superlatives: if the "largest war on record" loses its title,
  find the other articles that call it that.
