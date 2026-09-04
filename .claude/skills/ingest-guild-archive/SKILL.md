---
name: ingest-guild-archive
description: Turn a batch of guild material — a Discord export, forum threads, Google Docs, screenshots, a veteran's recollections — into archived sources and then into Chronicle articles. Use whenever someone hands over guild records to be added to the wiki, or when a folder of exports, links or images appears and needs working in.
---

# Ingesting a guild's records

Someone hands over what a guild kept. The job is always the same three steps,
and the value is lost at any one of them:

**get it** → **archive it** → **write from it**

Skipping the middle step is the usual failure. Material read straight into an
article cannot be checked afterwards by anyone, including you, and this project
has already published a fabricated line that way.

Follow `chronicle-article` for the writing itself. This skill covers everything
before that, and the traps particular to each kind of material.

## Before anything else: what is publishable

**An archived document is served publicly at `/chronicle/references/<id>`.**
Whatever lands in `data/wiki/sources/docs/` is on the internet. This is the
single most important fact in this skill, and the reason the ingest script
refuses to write until a person has looked.

Never archive, and never publish:

- real names, including a first name in passing ("tell Joshua", "confirm with
  Catherine" — both were in the Holders of LE export)
- ages, countries, time zones, schedules, school or work details
- Discord tags and IDs, emails, live invite links
- health information, and anything volunteered in confidence
- real-life photographs, and any real-world political content

Publishable: in-game names, guild tags, dates, territory, offices, rosters,
what people said about guild business.

Guild **application threads** are almost entirely the first list. Read them for
the opening post and officers' replies; do not mine the applications. Forty-four
such pages are recorded as deliberately unmined in
`data/wiki/research/analyses/uncited-sources-after-the-mining-pass.md`.

## Step 1 — get it

Ask for, in this order of value: the announcement channels, the guild's own
constitution or handbook, its history document, its thread, and the images.

A Discord export is plain text: `Author — M/D/YYYY H:MM AM` lines with messages
under them, `Image` on its own line where an attachment sat. Ask for the
attachment URLs as a separate list, one per line, in posting order — Discord's
copy-link gives signed URLs that expire, so fetch them the same day.

## Step 2 — archive it

### A Discord export

```bash
node scripts/import-discord-export.mjs <file.txt> --id <source-id> \
  --title "Guild X announcements (Discord export, 2018)" \
  --note "what this channel is and what was removed" \
  --tier primary --images urls.txt \
  --redact "Joshua=>Lee" --redact "Catherine=>Imperial's organiser"
```

It scans for the categories above and **exits without writing** until each is
either redacted or you pass `--reviewed`. The scan is a prompt, not a
guarantee: it caught "confirm with Catherine" and missed "bounty placements on
Joshua" in the same file. Read the export.

It strips live invite links, expiring attachment URLs and form links
automatically, downloads the images, writes `.webp` derivatives under
`public/images/chronicles/<id>/`, and scaffolds `alignment.json`.

### Everything else

```bash
node scripts/source-archive.mjs add <url> --tier primary --note "..."
node scripts/source-archive.mjs thread 278112          # every page of a thread
node scripts/source-archive.mjs reextract <id>         # re-run extraction, no refetch
node scripts/media-archive.mjs add <url> --subject <slug> --caption "..."
```

Google Docs: `/export` returning **401** means try `/mobilebasic`, which serves
the whole body — four documents were written off as inaccessible before someone
tried it. **410** means deleted; the four in
`data/wiki/research/unrecoverable-sources.md` are gone for good.

Testimony from a veteran is a source too. Write it as `<name>-oral-history`,
`kind: testimony`, `tier: retrospective`, following `cameron-oral-history` and
`thundderr-oral-history`: state the person's standing, what the account settles,
what it does not, and publish no transcript.

### Verify the images — ordinal alignment is a guess

`alignment.json` starts every image `verified: false`. **Open each one, describe
what it shows, and match it to the message it belongs to.** Do not trust the
order.

The Holders of LE export had ten `Image` markers and five attachments, because
Discord writes a marker for every link preview as well; only the first image sat
where counting predicted. The Federation export aligned perfectly. The storytime
corpus did not. There is no way to know but to look.

Record `depicts` in full — a territory map's guild-count panel read off carefully
is citable data, and nobody should have to open the image twice. A quotation from
an image will always come back as `quote-only-verifiable-in-image`; that is
correct, and the description is how it gets settled.

## Step 3 — write from it

Now follow `chronicle-article`. Two things this material rewards:

**Look for what it contradicts.** A guild's own channel is contemporaneous;
memoirs are not. The Holders of LE memoir says Thundderr gave the guild up on
1 April 2018 and it went inactive "from that point" — he is posting territory
orders in the channel on the 7th and the 28th. State both, attribute the memoir,
and let the record stand.

**Look for what it dates.** Announcement channels turn "around March 2018" into
"on 10 March 2018, in these words". The Valkyrie revival had no date until this
export gave it one.

Then, always:

```bash
node scripts/check-article-style.mjs --strict
node scripts/check-citations.mjs
node scripts/check-facts.mjs        # must not rise above LOW
npx vitest run
node scripts/seed-wiki-articles.mjs --dev && node scripts/seed-wiki-articles.mjs --prod
```

## Close the loop

Two things stop the next pass repeating this one:

- Anything you could not resolve goes in `data/wiki/research/analyses/` with the
  evidence on both sides. A contradiction recorded is worth more than one
  quietly decided.
- Anything you read and deliberately did not use goes in the same place with the
  reason. Otherwise someone reads it again next month hoping for more.

Check the editorial page at `/chronicle/admin` when you are done: the source
archive panel shows what is still uncited, and your new material should have
moved that number.
