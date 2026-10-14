// Checks every capability a pack names against the live Alexandria catalogue.
// Usage: FIRECRAWL_API_KEY=fc-... node scripts/check-packs.mjs
import { readdirSync, readFileSync } from 'node:fs';

const apiKey = process.env.FIRECRAWL_API_KEY;
if (!apiKey) throw new Error('Set FIRECRAWL_API_KEY to check packs against the catalogue.');
const apiUrl = (process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev').replace(/\/$/, '');
const dir = new URL('../src/packs/', import.meta.url);

async function catalogue(provider) {
  const ids = new Set();
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(`${apiUrl}/v2/scrape`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ alexandria: { provider: 'firecrawl', capability: 'find-tools', options: { providers: [provider], level: 'tools', limit: 100, offset, expand: [] } } }),
    });
    const page = (await response.json())?.data?.alexandria?.[0]?.data;
    if (!response.ok || !Array.isArray(page?.items)) throw new Error(`${provider}: find-tools returned ${response.status}`);
    for (const item of page.items) ids.add(`${item.provider}/${item.capability}`);
    if (!page.next) return ids;
  }
}

let missing = 0;
for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
  const pack = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  const refs = new Set(pack.recipes.flatMap((recipe) => recipe.steps.flatMap((step) => step.use ?? [])).filter((ref) => !ref.startsWith('firecrawl_')));
  const known = new Map();
  for (const provider of pack.providers) known.set(provider, await catalogue(provider));
  for (const provider of pack.providers) {
    if (!known.get(provider).size) console.log(`${pack.id}: provider ${provider} has no capabilities`), (missing += 1);
  }
  for (const ref of refs) {
    if (!known.get(ref.split('/')[0])?.has(ref)) console.log(`${pack.id}: ${ref} is not in the catalogue`), (missing += 1);
  }
  console.log(`${pack.id}: ${refs.size} capabilities across ${pack.providers.length} providers checked`);
}
process.exitCode = missing ? 1 : 0;
