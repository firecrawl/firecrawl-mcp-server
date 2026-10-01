import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

// Explicit maintenance step; normal builds never require credentials or network.
// Only discovery is authenticated. Public favicon requests never receive a key.
const account = process.env.FIRECRAWL_KEYCHAIN_ACCOUNT;
const key =
  process.env.FIRECRAWL_API_KEY?.trim() ||
  execFileSync(
    '/usr/bin/security',
    [
      'find-generic-password',
      '-s',
      'FIRECRAWL_API_KEY',
      ...(account ? ['-a', account] : []),
      '-w',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
if (!key)
  throw new Error('A Firecrawl credential is required to refresh logos');
async function discovery(path = '') {
  const response = await fetch(
    'https://api.firecrawl.dev/exchange/discover' + path,
    {
      headers: { Authorization: 'Bearer ' + key },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!response.ok)
    throw new Error('Provider discovery failed: ' + response.status);
  return response.json();
}
async function parallel(items, concurrency, run) {
  let next = 0;
  const results = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]);
      }
    })
  );
  return results;
}
const index = await discovery();
if (!Array.isArray(index.cohorts)) throw new Error('Invalid discovery index');
const cohorts = await parallel(index.cohorts, 5, ({ cohort }) =>
  discovery('/' + encodeURIComponent(cohort))
);
const providers = new Map();
for (const page of cohorts) {
  if (
    !Array.isArray(page.providers) ||
    page.catalogueVersion !== index.catalogueVersion
  )
    throw new Error('Catalog changed or returned an invalid page; retry');
  for (const provider of page.providers)
    if (typeof provider.provider === 'string')
      providers.set(provider.provider, provider);
}
let previous = {};
try {
  previous = JSON.parse(
    await readFile(
      new URL('../web/provider-logos.json', import.meta.url),
      'utf8'
    )
  ).providers;
} catch {
  /* Initial snapshot. */
}
const missing = [];
const logos = await parallel([...providers.values()], 8, async (provider) => {
  let website;
  try {
    website = new URL(
      /^https?:\/\//i.test(provider.website)
        ? provider.website
        : 'https://' + provider.website
    );
    if (
      !['https:', 'http:'].includes(website.protocol) ||
      !website.hostname.includes('.')
    )
      return undefined;
  } catch {
    return undefined;
  }
  const domain = website.hostname.toLowerCase().replace(/^www\./, '');
  // Brand overrides mirror firecrawl-web and are included in this checkout.
  let override;
  if (domain === 'datalegion.ai') {
    const bytes = await readFile(
      new URL(
        '../web/provider-icon-overrides/data-legion.webp',
        import.meta.url
      )
    );
    override = 'data:image/webp;base64,' + bytes.toString('base64');
  } else if (domain === 'firecrawl.dev') {
    const svg = (
      await readFile(
        new URL('../web/firecrawl-icon.svg', import.meta.url),
        'utf8'
      )
    )
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace('fill="currentColor"', 'fill="#fa5d19"');
    override =
      'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  }
  if (override)
    return [provider.provider, { website: website.href, src: override }];
  const embedded = provider.logoUrl;
  if (
    typeof embedded === 'string' &&
    embedded.length < 131072 &&
    /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(
      embedded
    )
  )
    return [provider.provider, { website: website.href, src: embedded }];
  try {
    // The same favicon source used by firecrawl-web's provider-icon proxy.
    // Reject 404 bodies: Google returns a valid generic globe for unknown sites.
    const response = await fetch(
      'https://www.google.com/s2/favicons?domain=' +
        encodeURIComponent(domain) +
        '&sz=64',
      { signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Icon unavailable');
    }
    const mime = response.headers.get('content-type')?.split(';')[0];
    if (
      ![
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'image/x-icon',
        'image/vnd.microsoft.icon',
      ].includes(mime)
    ) {
      await response.body?.cancel();
      throw new Error('Invalid icon type');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 65536)
      throw new Error('Invalid icon size');
    return [
      provider.provider,
      {
        website: website.href,
        src: 'data:' + mime + ';base64,' + bytes.toString('base64'),
      },
    ];
  } catch {
    // A transient image outage must not remove previously working artwork.
    if (previous[provider.provider]?.website === website.href)
      return [provider.provider, previous[provider.provider]];
    missing.push(provider.provider);
    return undefined;
  }
});
const snapshot = {
  catalogueVersion: index.catalogueVersion,
  providers: Object.fromEntries(
    logos.filter(Boolean).sort(([a], [b]) => a.localeCompare(b))
  ),
};
await writeFile(
  new URL('../web/provider-logos.json', import.meta.url),
  JSON.stringify(snapshot, null, 2) + '\n'
);
console.log(
  JSON.stringify({
    discovered: providers.size,
    bundled: Object.keys(snapshot.providers).length,
    missing: missing.sort(),
  })
);
