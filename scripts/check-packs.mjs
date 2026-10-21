// Checks every capability a pack names against the live Alexandria catalogue.
// With --write, also refreshes src/packs/calls.json, the call shape (required
// options and the names of the others) that results show for each capability.
// Usage: FIRECRAWL_API_KEY=fc-... node scripts/check-packs.mjs [--write]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const apiKey = process.env.FIRECRAWL_API_KEY;
if (!apiKey) throw new Error('Set FIRECRAWL_API_KEY to check packs against the catalogue.');
const apiUrl = (process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev').replace(/\/$/, '');
const dir = new URL('../src/packs/', import.meta.url);
const write = process.argv.includes('--write');

async function findTools(options) {
  const response = await fetch(`${apiUrl}/v2/scrape`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ alexandria: { provider: 'firecrawl', capability: 'find-tools', options: { level: 'tools', ...options } } }),
  });
  const page = (await response.json())?.data?.alexandria?.[0]?.data;
  if (!response.ok || !Array.isArray(page?.items)) throw new Error(`${options.providers}: find-tools returned ${response.status}`);
  return page;
}

async function catalogue(provider) {
  const ids = new Set();
  for (let offset = 0; ; offset += 100) {
    const page = await findTools({ providers: [provider], limit: 100, offset, expand: [] });
    for (const item of page.items) ids.add(`${item.provider}/${item.capability}`);
    if (!page.next) return ids;
  }
}

function callShape(contract) {
  const options = (contract.options ?? []).filter((option) => typeof option?.name === 'string');
  const required = options.filter((option) => option.required === true).map((option) => option.name);
  const groups = (contract.requiresOneOf ?? []).filter((group) => Array.isArray(group) && group.length);
  const grouped = new Set(groups.flat());
  const type = (name) => `<${options.find((option) => option.name === name)?.type ?? 'value'}>`;
  const rest = options.map((option) => option.name).filter((name) => !required.includes(name) && !grouped.has(name));
  const inputs = [
    ...required.map((name) => `${name} (required)`),
    ...groups.map((group) => `one of ${group.join(' | ')}`),
    ...rest.slice(0, 8),
    ...(rest.length > 8 ? ['…'] : []),
  ].join(', ');
  return {
    ...(typeof contract.name === 'string' ? { name: contract.name } : {}),
    options: Object.fromEntries([...required, ...groups.map((group) => group[0])].map((name) => [name, type(name)])),
    ...(inputs ? { inputs } : {}),
  };
}

let missing = 0;
const calls = {};
for (const file of readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'calls.json').sort()) {
  const pack = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
  const refs = pack.providers.flatMap((provider) => provider.capabilities.map((capability) => `${provider.id}/${capability}`));
  const known = new Map();
  for (const provider of pack.providers) known.set(provider.id, await catalogue(provider.id));
  for (const provider of pack.providers) {
    if (!known.get(provider.id).size) console.log(`${pack.id}: provider ${provider.id} has no capabilities`), (missing += 1);
  }
  for (const ref of refs) {
    if (!known.get(ref.split('/')[0])?.has(ref)) console.log(`${pack.id}: ${ref} is not in the catalogue`), (missing += 1);
  }
  if (write) {
    for (const provider of pack.providers) {
      const page = await findTools({ providers: [provider.id], capabilities: provider.capabilities, expand: ['options'], limit: 50 });
      for (const item of page.items) if (provider.capabilities.includes(item.capability)) calls[`${item.provider}/${item.capability}`] = callShape(item);
    }
  }
  console.log(`${pack.id}: ${refs.length} capabilities across ${pack.providers.length} providers checked`);
}
if (write) {
  const sorted = Object.fromEntries(Object.keys(calls).sort().map((key) => [key, calls[key]]));
  writeFileSync(new URL('calls.json', dir), JSON.stringify(sorted, null, 2) + '\n');
  console.log(`calls.json: ${Object.keys(sorted).length} call shapes written`);
}
process.exitCode = missing ? 1 : 0;
