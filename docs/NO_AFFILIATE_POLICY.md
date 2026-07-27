# No affiliate links, no commission

**Bowl takes no commission on food recommendations. No affiliate links are
to be added to recommendation output.**

## Why this is written down

Owner decision, 2026-07-27, made when the Zooplus/Viovet Awin affiliate
programmes were researched during Phase 2 (see `BUILD_PROGRESS.md`). Both
run product feeds that would have made GTIN/price harvesting trivial and
licensed — genuinely tempting from a pure data-engineering angle. The
programmes were not pursued, and the reason wasn't technical: taking a
commission on which food a recommendation engine points a dog owner toward
is a conflict of interest this product does not carry. Recorded here,
alongside `DATA_BOUNDARY.md`, so that fact survives independently of
whoever remembers the conversation that decided it.

## What this rules out

- No affiliate links, tracking codes, or referral parameters anywhere in
  `/recommendations` output or any page that renders a food recommendation.
- No revenue-share, commission, or "featured placement" arrangement with a
  food brand or retailer that could influence scoring, ranking, or which
  foods are shown.
- No joining an affiliate network (Awin, Impact, or similar) for the
  purpose of monetising recommendations, even if the same programme would
  also hand over useful catalogue data (GTIN, price, pack size) as a
  side effect.

## What this does not rule out

- Reading a retailer's page for factual product data (composition,
  nutrient analysis, GTIN, price, pack size) under the same allowlist/ToS
  review process as any other Phase 2 source — that's data collection, not
  monetisation.
- A future, separate, explicitly-approved commercial feature that is
  clearly not a food recommendation (e.g. a paid placement clearly labelled
  as advertising, kept structurally apart from the recommendation engine).
  That would be a new decision, not an extension of this one.

## Reversing this

If this is ever revisited, that must be a deliberate decision recorded as
a new entry in this file (or `docs/project-decisions.md`-equivalent for
this app), not a quiet addition of a `?ref=` parameter somewhere. The point
of writing this down bluntly is that a future change reads as a reversal,
not a drift.
