import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPubMedQuery, titleSimilarity } from '../researchDiscovery';
import { RESEARCH_DISCOVERY_TOPICS } from '../researchTopics';

test('PubMed query leads with Dogs MeSH and source-side metadata filters', () => {
  const query = buildPubMedQuery(RESEARCH_DISCOVERY_TOPICS[0], 2018, 2026);
  assert.match(query, /^"Dogs"\[Mesh\]/);
  assert.match(query, /\[Title\/Abstract\]/);
  assert.match(query, /hasabstract/);
  assert.match(query, /"2018\/01\/01"\[Date - Publication\]/);
  assert.match(query, /NOT "Case Reports"\[Publication Type\]/);
});

test('direct topics can add curated MeSH alternatives', () => {
  const pancreatitis = RESEARCH_DISCOVERY_TOPICS.find(
    (candidate) => candidate.key === 'pancreatitis-fat',
  );
  assert.ok(pancreatitis);
  const pancreatitisQuery = buildPubMedQuery(pancreatitis, 2018, 2026);
  assert.match(pancreatitisQuery, /"Pancreatitis"\[Mesh\]/);
  assert.match(pancreatitisQuery, /"Diet Therapy"\[Mesh\]/);
});

test('biological topics are canine-direct and Group G is methodology-only', () => {
  assert.ok(RESEARCH_DISCOVERY_TOPICS.length > 0);
  assert.ok(
    RESEARCH_DISCOVERY_TOPICS.every(
      (topic) => topic.group === 'G'
        ? topic.evidenceScope === 'veterinary_methodology'
        : topic.evidenceScope === 'canine_direct',
    ),
  );
});

test('title similarity catches punctuation variants but not unrelated titles', () => {
  assert.ok(
    titleSimilarity(
      'Diet-associated dilated cardiomyopathy in dogs: a review',
      'Diet associated dilated cardiomyopathy in dogs — a review',
    ) > 0.98,
  );
  assert.ok(
    titleSimilarity(
      'Diet-associated dilated cardiomyopathy in dogs',
      'Canine faecal microbiota transplantation',
    ) < 0.5,
  );
});
