import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobotsTxt, isPathAllowed } from '../../crawler/robotsTxt';

// Verbatim, re-fetched 2026-07-27 for this test — not paraphrased.
const ZOOPLUS_ROBOTS_TXT = `
# robots txt for zooplus
# created 07.10.2019
#
Sitemap: https://www.zooplus.co.uk/sitemap.xml

User-agent: *
Disallow: /ov?
Disallow: /detailedQuestion.htm$

User-agent: bingbot
Disallow: /ov?
Disallow: /detailedQuestion.htm$
Crawl-delay: 5

User-agent: msnbot
Disallow: /ov?
Disallow: /detailedQuestion.htm$
Crawl-delay: 5

User-agent: msnbot-media
Disallow: /ov?
Disallow: /detailedQuestion.htm$
Crawl-delay: 5

User-agent: ia_archiver
Disallow: /
`;

// Verbatim, captured 2026-07-27.
const VIOVET_ROBOTS_TXT = `
Sitemap: https://www.viovet.co.uk/sitemaps/index.xml

User-agent: facebookexternalhit
Disallow: /account.php
Disallow: /shopping_basket.php
Disallow: /checkout.php

User-agent: *
Disallow: /tuhq/
Disallow: /api/
Disallow: /account.php
Disallow: /shopping_basket.php
Disallow: /checkout.php
Disallow: /login.php
Disallow: /*.notajax$
Disallow: /*/c*/question$
Disallow: /*/c*/write-review$
Disallow: /*?vioban_type

User-agent: ClaudeBot
Crawl-delay: 1
`;

test('parseRobotsTxt groups rules under their User-agent, including multi-UA blocks', () => {
  const rules = parseRobotsTxt(ZOOPLUS_ROBOTS_TXT);
  const wildcard = rules.groups.find((g) => g.userAgents.includes('*'));
  assert.ok(wildcard);
  assert.equal(wildcard!.rules.length, 2);
  const bingbot = rules.groups.find((g) => g.userAgents.includes('bingbot'));
  assert.ok(bingbot);
  assert.equal(bingbot!.rules.length, 2); // Crawl-delay is ignored, not counted as a rule
});

test('zooplus: a generic dog-food category path is allowed for our UA (falls to the * group)', () => {
  const rules = parseRobotsTxt(ZOOPLUS_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/shop/dogs/dry_dog_food'), true);
});

test('zooplus: /ov? is disallowed for the generic group', () => {
  const rules = parseRobotsTxt(ZOOPLUS_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/ov?12345'), false);
});

test('zooplus: the exact /detailedQuestion.htm path is disallowed (prefix pattern, end-anchored)', () => {
  // No leading "*" in the real rule, so it is a prefix match anchored at
  // the domain root, not "any path ending in this" — only a bare request
  // to this exact path matches.
  const rules = parseRobotsTxt(ZOOPLUS_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/detailedQuestion.htm'), false);
});

test('zooplus: a path with extra trailing characters after detailedQuestion.htm is allowed — the $ anchor matters', () => {
  const rules = parseRobotsTxt(ZOOPLUS_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/detailedQuestion.htmXYZ'), true);
});

test('zooplus: detailedQuestion.htm nested under a product path is NOT matched — the rule has no leading wildcard', () => {
  // A common real-world trap: assuming a bare Disallow value behaves like
  // "*value*". It doesn't — it's a prefix from the root.
  const rules = parseRobotsTxt(ZOOPLUS_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/product/12345/detailedQuestion.htm'), true);
});

test('zooplus: ia_archiver is fully blocked but that group must not leak onto our own UA', () => {
  const rules = parseRobotsTxt(ZOOPLUS_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'ia_archiver', '/anything'), false);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/anything'), true);
});

test('viovet: /api/ is disallowed for the generic group', () => {
  const rules = parseRobotsTxt(VIOVET_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/api/products'), false);
});

test('viovet: a product category page is allowed', () => {
  const rules = parseRobotsTxt(VIOVET_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/dog/dog-food/dry-dog-food'), true);
});

test('viovet: the wildcard-plus-end-anchor question/write-review paths are disallowed', () => {
  const rules = parseRobotsTxt(VIOVET_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/dog-food/c123/question'), false);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/dog-food/c123/write-review'), false);
});

test('viovet: checkout/basket/login paths are disallowed', () => {
  const rules = parseRobotsTxt(VIOVET_ROBOTS_TXT);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/checkout.php'), false);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/shopping_basket.php'), false);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/login.php'), false);
});

test('a domain with no robots.txt at all (empty ruleset) allows everything — opt-out, not opt-in', () => {
  const rules = parseRobotsTxt('');
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/anything/at/all'), true);
});

test('a more specific Allow overrides a shorter Disallow at the same precedence level', () => {
  const rules = parseRobotsTxt(`
User-agent: *
Disallow: /private/
Allow: /private/public-page
`);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/private/secret'), false);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/private/public-page'), true);
});

test('"Disallow:" with an empty value blocks nothing', () => {
  const rules = parseRobotsTxt(`
User-agent: *
Disallow:
`);
  assert.equal(isPathAllowed(rules, 'DogSmartDB/1.0', '/anything'), true);
});
