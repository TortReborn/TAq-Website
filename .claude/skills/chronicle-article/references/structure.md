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

The body's first sentence repeats the title in **bold** and defines it again, as
Wikipedia does: `The **Federation** (tag **Fed**) was ...`

## Skeletons by page type

Drop any section with no sourced content. `(opt)` marks the commonly dropped ones.

### alliance — 300–700 words
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

### war — 250–600 words
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

### guild — 150–400 words
```
lede
## History           (chronological ### subsections, usually by era or alliance)
## Alliances         (bulleted list, linked, with dates)
## Legacy            (opt)
```
Infobox: Tag, Founded (only if known), Also known as (opt), Status.

### player — 100–300 words
Public in-game and forum facts only: guild roles, foundings, posts, offices.
**No real-world information of any kind.** No headings under about 300 words;
above that, `## Guild career` and, rarely, `## Views`.
Infobox: Known for, Active, Guilds.

### era — 400–900 words
```
lede
{{map:YYYY-MM-DD|A representative date}}
## The record        (opt — but era articles are where it earns its place)
## <chronological named sections>
## Legacy            (opt)
```

### update — 150–400 words
```
lede
## Background
## What changed
## Reception         (opt)
```

### general — 150–500 words
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
