import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChunkSpecies, filterCatOnlyChunks } from '../researchSpeciesFilter';

test('classifies a cat-only passage as cat_only', () => {
  assert.equal(
    classifyChunkSpecies('This recipe is formulated specifically for adult cats and kittens.'),
    'cat_only'
  );
});

test('classifies a dog-only passage as dog_relevant', () => {
  assert.equal(
    classifyChunkSpecies('This recipe is formulated specifically for adult dogs and puppies.'),
    'dog_relevant'
  );
});

test('classifies a mixed passage mentioning both species as dog_relevant', () => {
  assert.equal(
    classifyChunkSpecies('Unlike cats, dogs are omnivores and can digest starches efficiently.'),
    'dog_relevant'
  );
});

test('classifies species-neutral passage as dog_relevant (kept, not species-specific)', () => {
  assert.equal(
    classifyChunkSpecies('Our factory has operated under BRC-certified standards since 1998.'),
    'dog_relevant'
  );
});

test('is case-insensitive and matches singular/plural/canine/feline forms', () => {
  assert.equal(classifyChunkSpecies('Suitable for Cats of all life stages.'), 'cat_only');
  assert.equal(classifyChunkSpecies('A feline-specific formula.'), 'cat_only');
  assert.equal(classifyChunkSpecies('Canine gut health improves with fibre.'), 'dog_relevant');
});

test('does not false-positive on substrings (e.g. "category", "catalogue")', () => {
  assert.equal(
    classifyChunkSpecies('See the full product category listed in our catalogue.'),
    'dog_relevant'
  );
});

test('filterCatOnlyChunks discards only cat-only chunks and preserves order', () => {
  const chunks = [
    'Chunk 0: about dogs.',
    'Chunk 1: about cats only.',
    'Chunk 2: neutral company info.',
    'Chunk 3: about kittens and cats.',
    'Chunk 4: dogs and cats compared.',
  ];
  const result = filterCatOnlyChunks(chunks);
  assert.deepEqual(result.keptChunks, [
    'Chunk 0: about dogs.',
    'Chunk 2: neutral company info.',
    'Chunk 4: dogs and cats compared.',
  ]);
  assert.deepEqual(
    result.discardedChunks.map((c) => c.index),
    [1, 3]
  );
});

test('filterCatOnlyChunks keeps everything when no cat-only chunks exist', () => {
  const chunks = ['All about dogs.', 'More dog content.'];
  const result = filterCatOnlyChunks(chunks);
  assert.deepEqual(result.keptChunks, chunks);
  assert.equal(result.discardedChunks.length, 0);
});

test('filterCatOnlyChunks discards everything for an all-cat document', () => {
  const chunks = ['Cats need taurine.', 'Kittens grow fast.'];
  const result = filterCatOnlyChunks(chunks);
  assert.deepEqual(result.keptChunks, []);
  assert.equal(result.discardedChunks.length, 2);
});
