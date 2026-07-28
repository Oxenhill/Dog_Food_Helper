# Food Discovery & Acquisition — Design

**Status:** draft for owner review
**Belongs at:** `docs/FOOD_DISCOVERY_DESIGN.md`
**Date:** 2026-07-28

---

## 1. Problem

`foods` holds 312 rows. The UK market is estimated at 2000+ distinct products.
Of the 312, only 58 carry usable ingredient data inside the publishable catalogue
(53 clean, 5 opaque). Everything else is an identity with no composition.

Growth is currently 100% manual: a human finds a product, a human approves it.
There is no automated discovery of any kind. The previous `foodDiscovery` cron was
retired because it used an LLM as an extractor and fabricated composition and
nutritional values at scale.

**The failure of that cron is not an argument against automation.** It is an
argument against one specific thing: a model authoring values. That distinction
governs this whole design.

---

## 2. Principles

Carried forward from existing project doctrine. These are constraints, not goals.

1. **Discovery and extraction are separate jobs.** Finding that a product exists
   is not the same as reading what is in it. They have different risk profiles and
   must be built, run and gated separately.
2. **A model never authors a value.** A model may write an extractor. It may
   classify. It may never be the thing that decides a number or an ingredient name
   ends up in the database.
3. **Every value is traceable to source text.** If it cannot be pointed at in
   `composition_raw` or an equivalent verbatim capture, it is null.
4. **`inclusion_pct` only when printed.**
5. **Two-run discipline on anything that writes.** Run 1 parses and shows. Run 2
   commits.
6. **Respect terms of service.** Not just robots.txt. A permissive robots.txt with
   restrictive terms is a no.
7. **No affiliate revenue, ever.** This closes doors — see §3.6 — and closes them
   deliberately.
8. **Absence of evidence from a scoped tool is not evidence of absence.**

---

## 3. Source option space

This is the section to argue with. Nothing here is settled.

### 3.1 Open Pet Food Facts — currently excluded, should be reconsidered

Open Pet Food Facts publishes under **ODbL** — the same licence this project
publishes under. That is the cleanest possible licence compatibility: no permission
needed, no terms conflict, attribution and share-alike are already the plan.

It is currently held as fixtures only and barred from production writes. The stated
reason is quality: 469 UK products, roughly 28% carrying ingredients.

**That reason justifies review, not exclusion.** A 28% hit rate on 469 products is
~130 compositions available under a compatible licence with no legal question at
all. Compare: six permission emails sent to commercial parties yielded zero data.

*Proposal:* treat OPFF as a first-class source at Tier 2 (see §4), imported to
`contributed_foods` with provenance recorded, subject to the same review as any
other contribution. Quality is handled by review, not by a blanket ban.

*Open question for owner:* was the exclusion about quality, or about something else
(circular sourcing, ODbL attribution chains)? If the latter, that changes the answer.

### 3.2 Manufacturer websites — the main untapped surface

108 UK Pet Food trade association members sit in `manufacturer_targets`, all at
status `unapproached`. That is >90% of the UK market by volume and the canonical
list.

Manufacturers are the right target, not retailers:

- they own the composition data outright, so there is no third-party rights question
- they have a commercial interest in their products appearing in a comparison tool
- retailers hold barcodes but have uniformly refused, and their terms are the
  restrictive ones

**Bottleneck is not crawling — it is the legal review.** Each domain needs a
robots.txt read and a terms review before a single fetch. Done by hand that is 108
sessions of work, which is why it has not happened.

*Proposal:* a reconnaissance pass that gathers the evidence and stops. Fetch
robots.txt verbatim. Locate and fetch any terms/legal/copyright page. Extract only
the passages containing the terms that matter (scraping, crawling, robots, text and
data mining, database rights, intellectual property, reproduction, commercial use,
personal use). Store verbatim. Set status to `reviewed_pending_owner`.

It never sets `approved`. The owner decides, but decides on a pre-built dossier
rather than from scratch. 108 research tasks become 108 yes/no decisions.

### 3.3 Manufacturer spec sheets and trade documents

Many manufacturers publish product specification PDFs for retail and trade
customers, often more complete and more stable than the website. These are
frequently linked from a trade or wholesale section rather than the consumer site.

Under retained EU Regulation 767/2009 on the marketing of feed, composition and
analytical constituents are **mandatory label information**. This is legally
required public disclosure, not proprietary editorial. That is a materially
different position from a retailer's curated catalogue, and it is worth
understanding properly before assuming the same restrictions apply.

*Not legal advice — this needs a solicitor's view before it is relied on at scale.*

### 3.4 User label capture — proven, primary

The packet photo path works end to end. Royal Canin Hypoallergenic entered the
database this way with 12 ingredients and printed percentages intact.

This is the strongest position the project has:

- the user owns the packet
- composition is fact, and facts are not copyright
- no site's terms are engaged at all

*Underused asset:* the owner runs a dog training and behaviour practice. Clients
have packets in their kitchens. A "photograph your dog's food" ask to an existing
client base is a legitimate, willing, zero-legal-risk acquisition channel that no
competitor can replicate.

*Blocker:* capture is only reachable inside the dog/user flow. Admin standalone
capture is specified but not built.

### 3.5 GTIN / GS1 UK

0 of 312 foods carry a GTIN. Retailers hold barcodes and have all refused. Shopify
feeds returned 0 barcodes across 566 variants; ACANA JSON-LD returned 0 across 13
products.

Barcode capture from a user's phone is the only unblocked route. Verified by GS1 is
a human web tool at 30 lookups/day; programmatic access is partner-gated via
`gtincheck@gs1uk.org` and the draft email is written but unsent.

GTIN matters for deduplication and identity, not for composition. It is an
identity-layer improvement, not a data-volume one. Priority accordingly.

### 3.6 Closed by choice — affiliate feeds

zooplus and VioVet both run Awin affiliate programmes with product data feeds. A
licensed Awin feed typically carries GTIN, price and pack size per SKU — precisely
the identity fields that are missing — with no scraping question, because feed
access is licensed as part of joining.

**This is closed by the no-affiliate policy, and that policy stands.** Recorded here
so the decision is visible and deliberate rather than forgotten. Independence is the
product; a data shortcut that compromises it is not a shortcut.

### 3.7 Rejected sources

- **All About Dog Food** — ratings and editorial are copyright, compilation carries
  UK database right. Two derived rows quarantined.
- **Retailer sites generally** — petsathome, zooplus, VioVet, Burns, Wellbeloved,
  Canagan all reviewed, all restrictive.
- **Common Crawl / archive mirrors** — obtaining content from an intermediary does
  not launder the underlying rights. Not a route around a restrictive term.

---

## 4. Trust tiers and the write model

The current rule — nothing reaches `foods` except through manual approval — does not
scale to 2000 products, and a pipeline that can never produce a row is pointless.

The principle is not *never write*. It is **never write an unverified value.**

Verification does not have to be human in every case. It has to be *deterministic
and traceable*.

| Tier | Source | Verification | Write path |
|---|---|---|---|
| 0 | Discovery only | none needed — no values | direct to `crawl_targets` |
| 1 | Owner/admin label capture | human read the pack | `contributed_foods` → review → `foods` |
| 2 | ODbL sources (OPFF), manufacturer structured data | `composition_raw` captured verbatim, parse matches source text | `contributed_foods` → review → `foods` |
| 3 | Approved-domain crawl with a proven selector | selector reconnaissance done once; `composition_raw` captured; automated parse-vs-raw assertion | `contributed_foods` → **auto-promote if assertions pass**, else review |
| 4 | Anything a model interpreted | never trusted | rejected — does not exist as a path |

**Tier 3 is the scaling mechanism and the part that needs care.** Auto-promotion is
permitted only when all of these hold:

1. `composition_raw` is non-empty and was captured in the same fetch
2. every parsed ingredient name appears as a substring of `composition_raw`
3. every numeric written appears verbatim in the source text
4. no `inclusion_pct` unless a percentage is printed adjacent to that ingredient
5. the domain is `approved = true` and the fetch honoured its robots directives
6. the food does not duplicate an existing `foods` row on brand+name or GTIN

Any assertion failing sends the row to human review instead. Nothing is discarded.

This is the same discipline already applied by hand, expressed as code. It is
checkable, it fails loudly, and it does not involve a model.

---

## 5. Discovery pipeline

Model-free throughout. Cannot fabricate because it never writes a value.

**Inputs:** domains where `source_domain_allowlist.approved = true`.

**Process:** read sitemaps, honour robots.txt and crawl-delay, collect product URLs
and product names, deduplicate against `crawl_targets` and `foods.source_url`.

**Output:** `crawl_targets` rows at status `new`. Nothing else.

**Schedule:** weekly, via `pg_cron`, logged so `cron.job_run_details` shows it.

**Health:** raise a `system_alerts` row if two consecutive runs find zero new URLs
across all approved domains — that means either the surface is exhausted or the
pipeline is broken, and both need a human.

**Current constraint:** three approved domains, one of them drained. Discovery has
almost nowhere to run until §3.2 reconnaissance clears more domains. Sequence
accordingly: recon first, discovery second.

---

## 6. What this does not cover

**The research layer.** Separate concern, separate document. It is not client-facing
and not a ranking feature — it is the system's own knowledge base: current research
on canine nutrition, allergen activity, intolerance, and gut microbiome testing and
what its results imply for food choice. It is what makes an uploaded user document
*interpretable* rather than merely stored, and it should continue to learn with
minimal owner input.

It is a prerequisite for the user document upload path being meaningful, and it is a
substantial build in its own right — sourcing, chunking, embeddings, review status,
supersession, and a scoring path. It should not be started on a residual budget.

`research_documents` (0 rows) is the global literature store. It has no `dog_id` or
`owner_id` and is not the place for user uploads. No per-dog document table exists
yet; when built it is keyed to `auth.users` and therefore permanently private.

---

## 7. Open questions for the owner

1. **OPFF** — was the production-write exclusion about data quality, or something
   else? Quality is handled by review. If it was quality alone, this is the largest
   legally-clean source currently on the table.
2. **Tier 3 auto-promotion** — acceptable in principle, with the six assertions? Or
   should every row stay human-reviewed regardless, accepting the ceiling that
   implies?
3. **Recon pass over 108 manufacturers** — approve fetching robots.txt and terms
   pages for domains not yet on the allowlist? Reading a public terms page is not
   crawling a catalogue, but it is a fetch, and the call is yours.
4. **Client-base label capture** — worth a deliberate ask to training clients as an
   acquisition channel?
5. **Trade spec sheets** — worth a solicitor's opinion on the mandatory-label-
   information argument in §3.3 before relying on it?

---

## 8. Sequence

1. Resolve the open `assert_catalogue_export_boundary` alert
2. Reconnaissance pass over `manufacturer_targets` — unblocks everything downstream
3. Owner clears the recon queue, approving domains
4. Discovery cron against the widened approved set
5. Tier 3 auto-promotion with assertions, once a second domain has a proven selector
6. OPFF import at Tier 2, subject to Q1
7. Research layer — own document, own session
