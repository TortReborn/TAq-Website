---
title: "Sources we tried to archive and could not"
kind: note
---

# Sources we tried to archive and could not

Recorded so nobody spends another afternoon rediscovering it. A URL on this
list has been tried through every access path we have; re-fetching it is not
worth anyone's time unless the owner restores the document.

## Deleted Google Docs (HTTP 410, no snapshot)

Four documents from the batch a veteran supplied in `more sources.txt` are
gone. Not permission-restricted — `410 Gone`, which Google returns for a
document that has been deleted, on every path at once: `/export`,
`/mobilebasic`, and `/pub`. The Wayback Machine holds no snapshot of any of
them.

That distinction matters, because the *previous* four "inaccessible" documents
in the same batch turned out to be recoverable: `/export` returned 401 while
`/mobilebasic` served the whole body. A 401 means try harder. A 410 means the
document no longer exists.

| Document id | Status |
| --- | --- |
| `1-ImD017o9wmD7H3fEoikg6XRcq2fvwuC1aFQ5d-JgVM` | 410 on export, mobilebasic and pub; no snapshot |
| `1HMRzTL_t9YeEMccuOYLkO8lYHP4DyB0wAO52PE-EvkQ` | 410 on export, mobilebasic and pub; no snapshot |
| `1IpdNRpKLpfVzLQvOh2V5dOdh2_LxxM-xH9q9gY9Nl-Y` | 410 on export, mobilebasic and pub; no snapshot |
| `1GZtwhos4CsTWBrpQEJjqZ0zhfc-YkXYoV5cOPPZcDmQ` | 410 on export, mobilebasic and pub; no snapshot |

None carried an attribution line in the source list, so we do not know what
they contained. The only way back is the person who wrote them.

## Fandom pages (HTTP 403 to automated fetches)

Two Fandom articles refuse our fetcher and keep raw-URL citations rather than
archived ids. They are the entire remaining exception to the rule that every
citation resolves to an archived document.
