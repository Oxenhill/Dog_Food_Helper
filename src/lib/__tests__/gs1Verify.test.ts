import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGs1Configured } from '../gs1Verify';

test('isGs1Configured is false when neither env var is set', () => {
  const savedUrl = process.env.GS1_API_BASE_URL;
  const savedKey = process.env.GS1_API_KEY;
  delete process.env.GS1_API_BASE_URL;
  delete process.env.GS1_API_KEY;
  try {
    assert.equal(isGs1Configured(), false);
  } finally {
    if (savedUrl !== undefined) process.env.GS1_API_BASE_URL = savedUrl;
    if (savedKey !== undefined) process.env.GS1_API_KEY = savedKey;
  }
});

test('isGs1Configured is false when only one of the two env vars is set — never half-configured', () => {
  const savedUrl = process.env.GS1_API_BASE_URL;
  const savedKey = process.env.GS1_API_KEY;
  process.env.GS1_API_BASE_URL = 'https://example.com';
  delete process.env.GS1_API_KEY;
  try {
    assert.equal(isGs1Configured(), false);
  } finally {
    if (savedUrl !== undefined) process.env.GS1_API_BASE_URL = savedUrl;
    else delete process.env.GS1_API_BASE_URL;
    if (savedKey !== undefined) process.env.GS1_API_KEY = savedKey;
  }
});

test('isGs1Configured is true only when both env vars are set', () => {
  const savedUrl = process.env.GS1_API_BASE_URL;
  const savedKey = process.env.GS1_API_KEY;
  process.env.GS1_API_BASE_URL = 'https://example.com';
  process.env.GS1_API_KEY = 'test-key';
  try {
    assert.equal(isGs1Configured(), true);
  } finally {
    if (savedUrl !== undefined) process.env.GS1_API_BASE_URL = savedUrl;
    else delete process.env.GS1_API_BASE_URL;
    if (savedKey !== undefined) process.env.GS1_API_KEY = savedKey;
    else delete process.env.GS1_API_KEY;
  }
});
