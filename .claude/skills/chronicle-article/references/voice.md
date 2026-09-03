# Voice

Wikipedia's register, at roughly half its length.

## Measured targets

The corpus is checked against these; `check-article-style.mjs` reports them.

| Measure | Target | Why |
|---|---|---|
| In-prose attributions per 1,000 words | **≤ 1.0** | Ten historical Wikipedia articles average 0.89. The chronicle began this pass at 2.00. |
| Lede (the `summary` field) | **1–3 sentences**, ≤ 500 chars | Defines the subject and places it in time. |
| Sentences per paragraph | 2–5 | Single-sentence paragraphs are notes, not prose. |

Word budgets by page type are in `structure.md`.

## The four attributions worth keeping

Restated from SKILL.md because this is the rule that decides most edits:
opinion; genuine source disagreement; an interested party on their own conduct;
direct quotation. Nothing else.

The third case is subtle and matters here, because so much of the 2018 record is
one participant's memoir. "Drew1011 wrote that the merger was his own proposal"
keeps its attribution — he is claiming credit, and the reader needs to know the
claim is his. But "Snowythewolf made the first attack on Emorians' Llevigar
territories" is a plain event; it takes a footnote and no attribution, even
though it comes from the same memoir.

## Worked pairs, from this corpus

```
BEFORE  The opening of the war is described in detail only by Drew1011, writing in
        August 2018. By his account the first attack was made by Snowythewolf, a
        chief of Hall of Fame, against Emorians' Llevigar territories.
AFTER   The war opened on 17 February 2018 with an attack by Snowythewolf, a chief
        of Hall of Fame, on Emorians' Llevigar territories.
        (If the sole-witness problem matters to the article, say so once in
        `## The record`, not in every paragraph.)

BEFORE  Both the guild's own thread and the Valkyrie founding thread were authored
        by LoveLusting, styled "Queen of the Foxes", which makes her the closest
        thing the record has to a named founder of the alliance; her Valkyrie
        thread of September 2015 supplies the founding date, the "not for the
        purpose of war" clause and the Electorate text.
AFTER   LoveLusting, styled "Queen of the Foxes", founded the guild and the
        alliance. Valkyrie was created on 2 June 2015 "not for the purpose of
        war" and governed by an Electorate of guild masters.

BEFORE  The guild listed in the API today was created on 3 Jul 2016. An earlier
        version of this article recorded that whether that date marked a rename or
        a re-creation of the 2015 guild was not documented. A first-person account
        by Drew1011, archived in 2026, supplies an explanation that matches the
        API to the day.
AFTER   LoveLusting disbanded the guild on 2 July 2016; former Hax members
        re-registered the name and tag the following day.
```

The AFTER versions are shorter, carry the same facts, and lose nothing a reader
can act on — the footnote still says exactly where each came from.

## Word choice

- **Third person, past tense.** No "we", "our", "you". The Aquarium is described
  exactly like every other guild.
- **No peacock words**: dominant, legendary, iconic, greatest, remarkable,
  notable, significant, impressive. If a source uses one, quote and attribute it.
- **No weasel words**: some say, many believe, it is widely regarded.
- **No narrative flourish**: no rhetorical questions, no scene-setting, no
  "little did they know". The dates carry the drama unaided.
- **Hedge impersonally.** "The bloc appears to have dissolved in November" — not
  "our analysis suggests". One hedge per claim; never stack them
  ("may have possibly").
- **Specific over grand.** "held the entire map for 8 months and 25 days" beats
  "enjoyed a long period of supremacy".
- **No research-layer jargon.** "Quiet-territory exchanges", "FFA-cluster",
  "the chronicle", "the corpus" are internal methodology vocabulary — write
  "territory exchanges" and let [[territory-warfare]] explain the method once.
  Full list in `citations.md`.
- **Dates**: `17 February 2018` in prose, `17 Feb 2018` in infoboxes. Ranges take
  an en dash: `2018–2019`.
- **Numbers**: figures for counts and territories (`146 of roughly 332`); words
  for small quantities in prose (`five guilds left`).

## Structural economy

- One idea per sentence. The corpus's worst sentences chain three clauses with
  semicolons and dashes; split them.
- Cut the editorial connective tissue: "which makes her the closest thing the
  record has to", "it is worth noting that", "in a sense".
- Do not restate the lede in the first body section.
- Do not end an article with a summary paragraph. Wikipedia stops when the facts
  stop.
