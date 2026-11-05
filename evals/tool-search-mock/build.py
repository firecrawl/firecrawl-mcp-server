#!/usr/bin/env python3
"""Build the mock's data files from the firecrawl-mcp-server contract snapshot and an Alexandria catalogue pull."""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SNAP = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parents[1] / 'tests' / 'contract-snapshots'
RAW = ROOT / 'raw'
OUT = ROOT / 'package' / 'data'
OUT.mkdir(parents=True, exist_ok=True)

ALWAYS_LOAD = {'firecrawl_search', 'firecrawl_scrape'}

session = json.loads((SNAP / 'hosted-full.json').read_text())['sessions']['apiKey']
defs = json.loads((SNAP / 'tool-definitions.json').read_text())
base = []
for ref in session['tools']:
    d = dict(defs[ref])
    d.pop('outputSchema', None)
    if d['name'] in ALWAYS_LOAD:
        d['_meta'] = {'anthropic/alwaysLoad': True}
    base.append(d)
(OUT / 'base-tools.json').write_text(json.dumps(base, indent=1))
(OUT / 'instructions.txt').write_text(session['initialize']['instructions'])

directory = {p['provider']: p for p in json.loads((RAW / 'provider-directory.json').read_text())}
seed = json.loads((RAW / 'seed-items.json').read_text())
items, seen = [], set()
for it in seed['items'] + json.loads((RAW / 'filler-items.json').read_text()):
    if it['id'] in seen:
        continue
    seen.add(it['id'])
    items.append(it)

TLD = {'com', 'org', 'net', 'io', 'gov', 'edu', 'dev', 'ai', 'co', 'uk', 'br', 'ca', 'jp', 'fr', 'nl', 'de', 'au', 'my', 'site'}
def provider_slug(p):
    parts = p.split('-')
    while len(parts) > 1 and parts[-1] in TLD:
        parts.pop()
    return '_'.join(parts)[:24].rstrip('_')

TYPES = {'string': {'type': 'string'}, 'number': {'type': 'number'}, 'integer': {'type': 'integer'},
         'boolean': {'type': 'boolean'}, 'object': {'type': 'object'},
         'string[]': {'type': 'array', 'items': {'type': 'string'}}, 'number[]': {'type': 'array', 'items': {'type': 'number'}}}

names, catalogue = set(), []
for it in items:
    name = re.sub(r'[^a-z0-9_]', '_', f"{provider_slug(it['provider'])}_{it['capability']}".lower())
    name = re.sub(r'_+', '_', name)[:48].rstrip('_')
    n, i = name, 2
    while n in names:
        n = f"{name[:45]}_{i}"; i += 1
    names.add(n)
    prov = directory.get(it['provider'], {})
    props, required = {}, []
    for o in it.get('options') or []:
        schema = dict(TYPES.get(str(o.get('type')), {}))
        if o.get('about'):
            schema['description'] = o['about'][:400]
        if 'default' in o:
            schema['default'] = o['default']
        props[o['name']] = schema
        if o.get('required'):
            required.append(o['name'])
    input_schema = {'type': 'object', 'properties': props}
    if required:
        input_schema['required'] = required
    pdesc = (prov.get('description') or '').strip()
    if len(pdesc) > 300:
        pdesc = pdesc[:297].rsplit(' ', 1)[0] + '...'
    desc = f"{it['name']} ({prov.get('name', it['provider'])}). {it['description']}".strip()
    if pdesc:
        desc += f" Provider: {pdesc}"
    catalogue.append({'tool_name': n, 'id': it['id'], 'provider': it['provider'], 'provider_name': prov.get('name', it['provider']),
                      'provider_description': prov.get('description', ''), 'capability': it['capability'], 'name': it['name'],
                      'description': it['description'], 'options': it.get('options') or [], 'requiresOneOf': it.get('requiresOneOf'),
                      'tool': {'name': n, 'title': f"{it['name']} ({prov.get('name', it['provider'])})", 'description': desc[:2000],
                               'inputSchema': input_schema, 'annotations': {'readOnlyHint': True, 'openWorldHint': True}}})
(OUT / 'catalogue.json').write_text(json.dumps(catalogue, indent=1))
print(f"base={len(base)} catalogue={len(catalogue)} max_name={max(len(c['tool_name']) for c in catalogue)} "
      f"max_desc={max(len(c['tool']['description']) for c in catalogue)} instructions={len(session['initialize']['instructions'])}")
