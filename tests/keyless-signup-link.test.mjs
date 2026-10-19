import assert from 'node:assert/strict';
import test from 'node:test';
import { checkKeylessSignupUrl } from '../dist/keyless-signup-link.js';

const relayed = (value) => checkKeylessSignupUrl(value).ok;

test('relays the caller\'s own /k token link on either Firecrawl host', () => {
  assert.equal(relayed('https://firecrawl.dev/k/hrxch5c20tcs'), true);
  assert.equal(relayed('https://www.firecrawl.dev/k/hrxch5c20tcs'), true);
});

test('relays the regular keyless signin link regardless of parameter order or encoding case', () => {
  for (const url of [
    'https://www.firecrawl.dev/signin?utm_source=keyless&utm_medium=mcp',
    'https://firecrawl.dev/signin?utm_source=keyless&utm_medium=api',
    'https://www.firecrawl.dev/signin?utm_medium=cli&utm_source=keyless',
    'https://www.firecrawl.dev/signin?utm_source=keyless&utm_medium=mcp&redirect=%2Fapp%2Fapi-keys',
    'https://www.firecrawl.dev/signin?redirect=%2fapp%2fapi-keys&utm_medium=mcp&utm_source=keyless',
  ]) {
    assert.equal(relayed(url), true, url);
  }
});

test('rejects anything that is not one of Firecrawl\'s own signup links', () => {
  for (const url of [
    'https://evil.example/k/hrxch5c20tcs',
    'https://firecrawl.dev.evil.example/k/hrxch5c20tcs',
    'http://firecrawl.dev/k/hrxch5c20tcs',
    'https://firecrawl.dev:8443/k/hrxch5c20tcs',
    'https://user@firecrawl.dev/k/hrxch5c20tcs',
    'https://firecrawl.dev/k/hrxch5c20tcs?x=1',
    'https://firecrawl.dev/k/hrxch5c20tcs#frag',
    'https://firecrawl.dev/k/short',
    'https://firecrawl.dev/k/HRXCH5C20TCS',
    'https://www.firecrawl.dev/signin?utm_source=keyless&utm_medium=web',
    'https://www.firecrawl.dev/signin?utm_source=ads&utm_medium=mcp',
    'https://www.firecrawl.dev/signin?utm_source=keyless&utm_medium=mcp&redirect=https%3A%2F%2Fevil.example',
    'https://www.firecrawl.dev/signin?utm_source=keyless&utm_medium=mcp&next=%2Fx',
    'https://www.firecrawl.dev/signin?utm_source=keyless&utm_source=keyless&utm_medium=mcp',
    'https://www.firecrawl.dev/pricing?utm_source=keyless&utm_medium=mcp',
    'not a url',
    42,
  ]) {
    assert.equal(relayed(url), false, String(url));
  }
});

test('flags rejected Firecrawl-hosted links so format drift can be logged', () => {
  assert.deepEqual(
    checkKeylessSignupUrl('https://www.firecrawl.dev/signin?utm_source=keyless&utm_medium=web'),
    { ok: false, firecrawlHost: true }
  );
  assert.deepEqual(checkKeylessSignupUrl('https://evil.example/k/hrxch5c20tcs'), {
    ok: false,
    firecrawlHost: false,
  });
});
