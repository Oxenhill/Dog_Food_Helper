import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIlikeTerm } from '../postgrestFilter';

/**
 * Splits a PostgREST logic-tree condition list on top-level commas, the same
 * way PostgREST does: commas inside a double-quoted value don't split.
 * Mirrors the parser behaviour that a bare comma in a search term broke.
 */
function splitLogicTree(list: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '\\' && i + 1 < list.length) {
      current += ch + list[i + 1];
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Reverses PostgREST's quoted-value unescaping: \" -> ", \\ -> \. */
function unquotePostgrestValue(quoted: string): string {
  const inner = quoted.slice(1, -1);
  return inner.replace(/\\(.)/g, '$1');
}

test('search term with a comma does not split the logic tree', () => {
  const raw = 'Cod, Pumpkin & Orange';
  const term = buildIlikeTerm(raw);
  const tree = `brand.ilike.${term},name.ilike.${term}`;
  const parts = splitLogicTree(tree);
  assert.equal(parts.length, 2);
  assert.equal(parts[0], `brand.ilike.${term}`);
  assert.equal(parts[1], `name.ilike.${term}`);
});

test('full product name with comma and & survives round trip', () => {
  const raw = 'Farmina N&D Ocean Adult Medium & Maxi Dog Food - Cod, Pumpkin & Orange';
  const term = buildIlikeTerm(raw);
  const tree = `brand.ilike.${term},name.ilike.${term}`;
  const parts = splitLogicTree(tree);
  assert.equal(parts.length, 2);
  const value = parts[0].slice('brand.ilike.'.length);
  assert.equal(unquotePostgrestValue(value), `%${raw}%`);
});

test('name with a double quote is escaped and survives round trip', () => {
  const raw = '6" Bully Stick';
  const term = buildIlikeTerm(raw);
  const tree = `name.ilike.${term}`;
  const parts = splitLogicTree(tree);
  assert.equal(parts.length, 1);
  const value = parts[0].slice('name.ilike.'.length);
  assert.equal(unquotePostgrestValue(value), `%${raw}%`);
});

test('name with a period is left untouched (not a LIKE wildcard)', () => {
  const raw = 'No.1 Complete Dog Food';
  const term = buildIlikeTerm(raw);
  assert.equal(term, `"%${raw}%"`);
});

test('ILIKE wildcards % and _ in the term are escaped so they match literally', () => {
  const raw = '50% Grain_Free';
  const term = buildIlikeTerm(raw);
  const value = unquotePostgrestValue(term);
  assert.equal(value, '%50\\% Grain\\_Free%');
});
