# TAq-Website — working rules

## The private Discord archive

There is a bulk export of guild Discord history at `C:\Vault\discord-archive`,
collected through a bot with read permission. It is split into two tiers, and
the tier decides everything.

**This repo is public on GitHub, and `data/wiki/sources/docs/<id>.md` is served
to the internet at `/chronicle/references/<id>`.** Anything that lands in this
repo is published, whether or not the site renders it.

### Tier A — announcement channels: normal sources

`#announcements`, `#public-announcements`, `#info`, `#welcome`, alliance
announcement channels, formal votes. Leadership speaking to their whole
community, representatively.

These are archived and quoted like any forum thread, through the existing
`ingest-guild-archive` skill and its redaction scan. The thirteen sources with
`kind: "discord-export"` are all of this kind and are fine as they stand.

The scan still applies in full. An announcement channel is not a licence to
publish a real name, an age, or a personal detail.

### Tier B — everything else: informs only, never appears

General chat, war rooms, coordination, officer talk. People talking to each
other, not to an audience. Three rules, in force for every session:

1. **Never read Tier B from this repo.** Article writing reads *findings files*
   under `docs/discord-findings/` (gitignored) — reviewed, paraphrased claim
   lists. If you find yourself wanting the underlying messages, that is the
   boundary working; ask for a finding instead. Tier B and the wiki are never
   open in the same session.
2. **No direct quotes from Tier B, ever.** Not in prose, captions, infoboxes,
   commit messages, or PR descriptions. A phrase lifted verbatim is a quote even
   without quotation marks.
3. **Nothing from Tier B is committed.** Not to `data/`, not to `public/`, not
   to `docs/` in tracked form.

### Citing a Tier B claim

```bash
node scripts/register-private-source.mjs <id>-discord-private \
  --guild "The Federation" --window "January–June 2017"
```

Writes an entry to `data/wiki/sources/index.json` with `private: true`, no url,
and **no document**. `loadSource` 404s without a doc file, so the citation
renders as coarse provenance and leads nowhere public. The claim stays auditable
to us through the concordance kept beside the archive.

Never create `data/wiki/sources/docs/<id>-discord-private.md`. That single file
would publish the thing the whole arrangement exists to keep private.

### Checks

```bash
node scripts/check-private-sources.mjs --strict
```

Verifies no private source has a document, url or public images; no findings
file is tracked; and no article quotes a private source. Run it before any
commit that touches wiki data.

### What may never be published, from either tier

Real names including a first name in passing, ages, countries, time zones,
school or work details, Discord tags or ids, emails, health information,
relationships, anything said in distress, anything from someone plainly a minor,
DM screenshots.

A large share of the 2016–2018 population were teenagers. When a detail is
interesting because it is personal rather than because it is historical, leave
it out.

Full policy: `C:\Users\Aiden Smith\Code\discord-research\POLICY.md`.
