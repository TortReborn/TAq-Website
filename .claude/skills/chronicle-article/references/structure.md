# Structure

Section order follows one principle, taken from Wikipedia's historical articles:

> **definition → origins → structure → chronological narrative → consequences →
> lists → legacy**

Lists and tables sit near the end. Legacy sections are last and are optional.
Never write a heading you cannot fill from sources; a missing section is honest,
an empty one is padding.

## The lede (the `summary` field)

One to three sentences, ≤ 500 characters. Sentence one defines the subject and
places it in time. The rest give only the facts a reader needs to know if they
read nothing else.

```
GOOD  The Federation was the dominant Wynncraft war alliance of 2018. Founded on
      16 February 2018 from the Coalition remnant and the remains of War
      Syndicate, it took the entire territory map five days later and held it for
      eight months before collapsing on 10 November 2018.

BAD   One of the longest arcs in Wynncraft warring: attested from 2015 as
      'Kingdom of Foxes', co-founder of the Valkyrie alliance, disbanded and
      revived under the name Foxton Legacy in 2016, a member of the Emperium of
      Wynn, co-founder of the Coalition of 2017, Federation member, target and
      then member of Luna, ...
      (A comma-spliced inventory. The body's job, not the lede's.)
```

**The summary IS the lede — the body must not restate it.** This is where we
differ from Wikipedia, and the difference is easy to get wrong. On Wikipedia the
lede *is* the article's first paragraph. Here `summary` is a separate field that
renders as its own paragraph above the body, so a body that opens by defining
the subject again shows the reader the same sentences twice, one after the
other.

So the body opens at its **first section heading**, or with a paragraph that
carries the story forward:

```
BAD   summary: "Valhalla was the dominant war alliance of mid-to-late 2021,
                formed on 11 May 2021 by thirteen guilds …"
      body:    "**Valhalla** was the dominant war alliance of mid-to-late 2021,
                formed on 11 May 2021 by thirteen guilds …"
      (Word for word. The reader reads it twice.)

GOOD  body:    "## History
                ### Founding
                On 11 May 2021, in The Great Collapse, Goose and Artemis
                dissolved on the same day …"
```

Word-for-word repetition is the rare case. The common one is a body that opens
by defining the subject again in *fresh* words — no shared phrasing, and still
two ledes stacked on the page:

```
BAD   summary: "Niflheim was a community alliance of 2020-2021 whose four
                members … simultaneously belonged to the era's war blocs. It
                officially dissolved on 18 December 2021 …"
      body:    "Niflheim's four members were simultaneously war-alliance
                guilds, and it dissolved on 18 December 2021 …"
      (Not one shared phrase. Says nothing the summary has not.)
```

Elaboration is not repetition. A body paragraph that restates a summary fact
**and adds a citation, an exact date or a figure the summary lacks** is doing
real work — the summary says "created in September 2023", the body says
"created on 28 September 2023{{cite:…}}". Keep those.

That is the test `check-article-style.mjs` applies, to the opening paragraph and
again to its first sentence: does this span cite a source found nowhere else in
the body, or state a date, figure or quotation the summary lacks? A span that
does neither exists only to restate, and is reported as a second lede. When the
warning is right, the fix is rarely deletion alone — move the sentence's
citation and its `[[links]]` to the section where the fact belongs, and check
that the next paragraph still names its own subject rather than opening on a
pronoun.

One consequence to plan around: the summary renders as plain text, so
`[[links]]` in it do not resolve. Every subject worth linking must therefore be
linked somewhere in the body.

## Skeletons by page type

Drop any section with no sourced content. `(opt)` marks the commonly dropped ones.

There are no word budgets: length is judged against the evidence (see
`voice.md`). Write what the sources support and stop.

### alliance
```
lede
## The record        (opt — only when one contested account carries the article)
## Formation
## Organization      (opt — only if governance is actually recorded)
## History           (chronological ### subsections for campaigns and wars)
## Dissolution       (opt — or fold into History)
## Membership        ({{alliance:Name}} embed; the name must match the chronicle exactly)
## Legacy            (opt — only if later sources actually discuss it)
```
Infobox: Tag, Kind (War alliance / Community alliance), Active, Peak size, Founder.

### war
```
lede
{{map:YYYY-MM-DD|The map when the war began}}
## Background
## Course of the war  (or named phases as ### subsections)
## Aftermath
```
Infobox: Date, Belligerents (linked), Outcome (only if recorded).
Add `{{war-chart:Guild A|Guild B|YYYY-MM-DD|YYYY-MM-DD}}` where both principals
and the window are known; guild names must be full in-game names, and the data
only exists from January 2018.

### guild
```
lede
## History           (chronological ### subsections, usually by era or alliance)
## Alliances         (bulleted list, linked, with dates)
## Legacy            (opt)
```
Infobox: Tag, Founded (only if known), Also known as (opt), Status.

### player
Public in-game and forum facts only: guild roles, foundings, posts, offices.
**No real-world information of any kind.** No headings under about 300 words;
above that, `## Guild career` and, rarely, `## Views`.
Infobox: Known for, Active, Guilds.

### era
```
lede
{{map:YYYY-MM-DD|A representative date}}
## The record        (opt — but era articles are where it earns its place)
## <chronological named sections>
## Legacy            (opt)
```

### update
```
lede
## Background
## What changed
## Reception         (opt)
```

### general
Free-form, but still definition-first and chronological where it can be.

## Infoboxes

An infobox is a fact sheet, not prose. Wikipedia keeps values to a few words.

- One fact per row. **No semicolons, no clauses, no narrative.**
- Values ≤ 60 characters wherever possible (hard cap 300).
- Dates in short form: `16 Feb 2018`.
- Links allowed: `[[Drew1011]]`.
- Omit a row rather than write "unknown".

```
BAD   Map control from | 21 Feb 2018 (356 of 383 territories); the opposing bloc
                         was eliminated on 19–20 Mar 2018
GOOD  Map control     | 21 Feb – 10 Nov 2018
      (The 356-of-383 figure and the elimination date belong in the body.)
```

## Wiki dialect

- Internal links `[[Page Title]]` or `[[slug|label]]`. Link the **first mention**
  of a guild, alliance, player, war, era or update that has a page — not every
  later mention.
- Headings `## Section` / `### Subsection`; these build the table of contents.
- Never hand-write a `## Sources` or `## References` list. The reference list is
  generated from the inline citations.
- No raw HTML. GFM tables are fine.
- Every image needs a caption, and its citation goes **inside** the caption.
