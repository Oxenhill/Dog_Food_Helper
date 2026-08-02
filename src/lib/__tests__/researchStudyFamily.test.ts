import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorOverlap,
  findStudyFamilyMatch,
  StudyFamilyCandidate,
  StudyFamilyPrimary,
} from '../researchStudyFamily';

// titleSimilarity('Effect of high-fibre diets on stool consistency in adult
// Labradors', X) for the three X values below, confirmed once against the
// real bigram-similarity function: 0.9333 (>= 0.92, qualifies title-only),
// 0.9143 (in [0.85, 0.92), qualifies only with author overlap + close year),
// 0.8429 (below both thresholds, never qualifies).
const BASE_TITLE = 'Effect of high-fibre diets on stool consistency in adult Labradors';
const TITLE_ONLY_MATCH = 'Effects of high-fibre diets on stool consistency in adult Labrador dogs';
const AUTHOR_ASSISTED_MATCH = 'Effect of high fibre diet on stool consistency in adult Labradors, a preprint';
const TOO_DIFFERENT = 'Effects of high fibre diets on faecal consistency in adult working Labradors';

function primary(overrides: Partial<StudyFamilyPrimary> = {}): StudyFamilyPrimary {
  return {
    id: 'primary-1',
    title: BASE_TITLE,
    authors: ['smith j', 'jones am'],
    publication_year: 2024,
    is_preprint: false,
    abstract_only: false,
    evidence_grade: 'B',
    has_claims: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<StudyFamilyCandidate> = {}): StudyFamilyCandidate {
  return {
    title: BASE_TITLE,
    authors: ['smith j', 'jones am'],
    publication_year: 2024,
    is_preprint: false,
    abstract_only: false,
    evidence_grade: 'B',
    ...overrides,
  };
}

test('authorOverlap returns the exact shared normalized author strings', () => {
  assert.deepEqual(authorOverlap(['smith j', 'jones am'], ['jones am', 'lee k']), ['jones am']);
  assert.deepEqual(authorOverlap(['smith j'], ['lee k']), []);
});

test('a title similarity of 0.92 or above matches even with no shared authors', () => {
  const match = findStudyFamilyMatch(
    candidate({ title: TITLE_ONLY_MATCH, authors: ['nguyen t'] }),
    [primary()]
  );
  assert.ok(match);
  assert.equal(match!.method, 'title_only');
  assert.equal(match!.matched_authors.length, 0);
});

test('a title similarity between 0.85 and 0.92 only matches when authors overlap and the year is close', () => {
  const withSharedAuthor = findStudyFamilyMatch(
    candidate({ title: AUTHOR_ASSISTED_MATCH, authors: ['smith j'], publication_year: 2023 }),
    [primary({ publication_year: 2024 })]
  );
  assert.ok(withSharedAuthor);
  assert.equal(withSharedAuthor!.method, 'author_and_title');
  assert.deepEqual(withSharedAuthor!.matched_authors, ['smith j']);

  const withoutSharedAuthor = findStudyFamilyMatch(
    candidate({ title: AUTHOR_ASSISTED_MATCH, authors: ['nguyen t'] }),
    [primary()]
  );
  assert.equal(withoutSharedAuthor, null);

  const tooFarApartInYear = findStudyFamilyMatch(
    candidate({ title: AUTHOR_ASSISTED_MATCH, authors: ['smith j'], publication_year: 2020 }),
    [primary({ publication_year: 2024 })]
  );
  assert.equal(tooFarApartInYear, null);
});

test('a title similarity below 0.85 never matches, even with identical authors', () => {
  const match = findStudyFamilyMatch(
    candidate({ title: TOO_DIFFERENT, authors: ['smith j', 'jones am'] }),
    [primary()]
  );
  assert.equal(match, null);
});

test('a fuller candidate is promoted to primary only when the existing primary has no claims yet', () => {
  const promoted = findStudyFamilyMatch(
    candidate({ title: TITLE_ONLY_MATCH, is_preprint: false, abstract_only: false, evidence_grade: 'A' }),
    [primary({ is_preprint: true, abstract_only: true, evidence_grade: 'D', has_claims: false })]
  );
  assert.ok(promoted);
  assert.equal(promoted!.new_document_is_fuller, true);

  const notPromoted = findStudyFamilyMatch(
    candidate({ title: TITLE_ONLY_MATCH, is_preprint: false, abstract_only: false, evidence_grade: 'A' }),
    [primary({ is_preprint: true, abstract_only: true, evidence_grade: 'D', has_claims: true })]
  );
  assert.ok(notPromoted);
  assert.equal(
    notPromoted!.new_document_is_fuller,
    false,
    'a document with claims already drafted from it must never be demoted'
  );
});

test('picks the single best-scoring match across multiple candidate primaries', () => {
  const closeMatch = primary({ id: 'close', title: TITLE_ONLY_MATCH });
  const exactMatch = primary({ id: 'exact', title: BASE_TITLE });
  const match = findStudyFamilyMatch(candidate(), [closeMatch, exactMatch]);
  assert.ok(match);
  assert.equal(match!.matched_primary_id, 'exact');
});
