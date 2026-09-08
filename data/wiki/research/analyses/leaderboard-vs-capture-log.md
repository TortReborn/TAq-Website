# A leaderboard snapshot and a capture log answer different questions

**Status: explained, not a contradiction. Do not "fix" either figure.**

## The apparent conflict

`kingdom-foxes` and `federation-era` both state that Kingdom Foxes held 82
territories in April 2018, from a leaderboard capture, and that all 384
territories on 16 April 2018 were held by fifteen Federation guilds.

A replay of the 2018 capture record for that same day gives Kingdom Foxes ranging
between 43 and 80 territories, ending the day at 54, with 293 territories having
a recorded holder and thirteen distinct holders.

## Why both are right

A capture log only knows about a territory once it has changed hands. On 16 April
2018 that record was seventeen days old, so 91 of the 384 territories had not yet
moved and were invisible to it. A leaderboard reads every territory at one
instant; a replay reads the subset that has moved, across a whole day.

And the day itself was volatile: Kingdom Foxes' holdings swung by 37 territories
inside those twenty-four hours. In April 2018 the question "how many territories
does this guild hold" had dozens of defensible answers depending on the minute it
was asked.

## The rule this gives

- A **leaderboard or API snapshot** is a total at an instant. Prefer it for
  "how much did a guild hold".
- A **capture log** is a record of movement. Prefer it for "how much fighting
  happened", and treat any holdings figure derived from one as a floor until the
  log has run long enough to have seen every territory move at least once.
- Where both exist for the same day and disagree, that is expected. Neither is
  more true.

Two figures from these two kinds of source should not be compared without saying
which is which — which is why the capture-derived figures on `territory-warfare`
carry their cautions in the prose rather than only in the citation.
