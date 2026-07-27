# Sources

Third-party data used by Bowl, and the licence terms under which it's used.

## Open Pet Food Facts

`fixtures/opff_barcode_seed.json` — 1,392 UK and dog-food-category product
records (barcode, product name, brand, ingredients text) fetched via the
Open Pet Food Facts API (`world.openpetfoodfacts.org/api/v2/search`) on
2026-07-27.

Licence: [Open Database License (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/1-0/),
with individual record contents under the Database Contents License (DbCL).
Attribution retained in the file's `_attribution` header.

Role in this project: a barcode-checksum seed and an ingredient-string
parser fixture corpus only — not a primary ingredient data source. UK
coverage is thin (469 products total; see BUILD_PROGRESS.md for why this
isn't treated as more than that).
