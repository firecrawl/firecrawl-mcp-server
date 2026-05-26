import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import {
  assertSafeExternalUrl,
  assertSafeExternalUrls,
  isBlockedLocalUrl,
} from '../dist/urlGuard.js';

describe('urlGuard', () => {
  const originalAllowPrivate = process.env.FIRECRAWL_ALLOW_PRIVATE_NETWORKS;

  afterEach(() => {
    if (originalAllowPrivate === undefined) {
      delete process.env.FIRECRAWL_ALLOW_PRIVATE_NETWORKS;
    } else {
      process.env.FIRECRAWL_ALLOW_PRIVATE_NETWORKS = originalAllowPrivate;
    }
  });

  for (const url of [
    'http://localhost:3000',
    'https://app.localhost/path',
    'http://127.0.0.1:8080',
    'http://10.1.2.3',
    'http://172.16.0.10',
    'http://172.31.255.255',
    'http://192.168.1.2',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://[fe80::1]/',
    'http://[fd12:3456::1]/',
    'http://[::ffff:127.0.0.1]/',
  ]) {
    it(`blocks local/private URL ${url}`, () => {
      assert.equal(isBlockedLocalUrl(url), true);
      assert.throws(
        () => assertSafeExternalUrl(url),
        /local or private network/
      );
    });
  }

  for (const url of [
    'https://firecrawl.dev',
    'https://docs.firecrawl.dev/features/scrape',
    'https://example.com/blog/*',
    'http://8.8.8.8',
  ]) {
    it(`allows public URL ${url}`, () => {
      assert.equal(isBlockedLocalUrl(url), false);
      assert.doesNotThrow(() => assertSafeExternalUrl(url));
    });
  }

  it('checks every URL in array inputs', () => {
    assert.throws(
      () =>
        assertSafeExternalUrls(['https://firecrawl.dev', 'http://127.0.0.1']),
      /local or private network/
    );
  });

  it('allows private-network URLs when explicitly enabled', () => {
    process.env.FIRECRAWL_ALLOW_PRIVATE_NETWORKS = 'true';

    assert.doesNotThrow(() => assertSafeExternalUrl('http://127.0.0.1:3000'));
  });
});
