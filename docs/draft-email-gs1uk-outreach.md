# Draft — outreach to GS1 UK

Not sent. Owner to review, edit, and send from their own address.

Context (for the owner, not the recipient): "Verified by GS1" is a
30-searches/day web tool for humans, not a self-serve API. The actual
programmatic option — the "GTIN Check API" — is partner-gated: GS1 UK's own
docs say only members who have been issued a key may access it, contact
gtincheck@gs1uk.org. This asks about that, framed around what the project
actually is (a free, open allergen database) rather than a generic API
request, since that's the honest pitch and the one most likely to get a
useful reply.

---

**To:** gtincheck@gs1uk.org
**Subject:** Programmatic GTIN verification for a free, open-licence dog food allergen database

Hello,

I'm building Bowl, a free tool that helps UK dog owners check a food
against their dog's allergies and health conditions, backed by an open
database of UK dog food composition data (ingredients, analytical
constituents) published under the Open Database License (ODbL).

Owners can photograph a packet's barcode as part of identifying a
product. I validate the GTIN's checksum locally before doing anything
with it, but I'd like to confirm it against GS1's own registry — brand
and product — before it becomes an identity anchor in the database,
rather than trusting a checksum-valid number alone.

I understand "Verified by GS1" is a 30-searches/day web tool, and that
programmatic access is via the GTIN Check API, which requires a key
issued directly by GS1 UK. Could you tell me:

- Whether the GTIN Check API is available to a small, free, non-commercial
  project like this one, and what the process/cost (if any) would be to
  get a key.
- The actual request/response shape (endpoint, authentication header,
  JSON fields) — I haven't been able to find this published anywhere
  public, and I'd rather build against the real specification than guess.
- Any rate limits or usage terms I should design around.

Happy to answer any questions about the project, its scope, or how the
data would be used and published.

Thank you for your time.

[Owner name]
Dog Smart Training & Behaviour
trainers@dogsmarttrainingbehaviour.co.uk
