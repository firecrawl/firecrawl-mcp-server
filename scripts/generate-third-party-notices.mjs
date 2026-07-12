import assert from 'node:assert/strict';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const metafilePath = path.join(projectRoot, 'dist/metafile-esm.json');
const noticePath = path.join(projectRoot, 'THIRD_PARTY_NOTICES.md');
const mode = process.argv[2];

assert.ok(
  mode === '--check' || mode === '--write',
  'usage: node scripts/generate-third-party-notices.mjs --check|--write'
);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findPackageRoot(inputPath) {
  let directory = path.dirname(path.resolve(projectRoot, inputPath));
  while (directory.startsWith(projectRoot)) {
    const manifestPath = path.join(directory, 'package.json');
    if (directory.includes(`${path.sep}node_modules${path.sep}`)) {
      if (await exists(manifestPath)) {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        if (manifest.name && manifest.version) return directory;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

function normalizeLicenseText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function readLicenseSection(readme) {
  const lines = normalizeLicenseText(readme).split('\n');
  const start = lines.findIndex((line) =>
    /^#{1,6}\s+licen[cs]e\s*$/i.test(line)
  );
  if (start < 0) return undefined;
  const headingLevel = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#+)\s+/);
    if (heading && heading[1].length <= headingLevel) {
      end = index;
      break;
    }
  }
  return normalizeLicenseText(lines.slice(start, end).join('\n'));
}

async function licenseMaterials(packageRoot) {
  const entries = (await readdir(packageRoot))
    .filter((entry) => /^(licen[cs]e|copying|notice)(\..*)?$/i.test(entry))
    .sort((left, right) => left.localeCompare(right));

  const materials = [];
  for (const entry of entries) {
    materials.push({
      name: entry,
      text: normalizeLicenseText(
        await readFile(path.join(packageRoot, entry), 'utf8')
      ),
    });
  }
  if (materials.length > 0) return materials;

  const readmeName = (await readdir(packageRoot))
    .sort((left, right) => left.localeCompare(right))
    .find((entry) => /^readme(?:\..*)?$/i.test(entry));
  if (readmeName) {
    const section = readLicenseSection(
      await readFile(path.join(packageRoot, readmeName), 'utf8')
    );
    if (section) {
      return [{ name: `${readmeName} — license section`, text: section }];
    }
  }
  return [];
}

async function bundledPackages() {
  const metafile = JSON.parse(await readFile(metafilePath, 'utf8'));
  const packages = new Map();
  for (const inputPath of Object.keys(metafile.inputs)) {
    const packageRoot = await findPackageRoot(inputPath);
    if (!packageRoot) continue;
    const manifest = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8')
    );
    assert.ok(
      manifest.name && manifest.version,
      `invalid manifest: ${packageRoot}`
    );
    packages.set(`${manifest.name}@${manifest.version}`, {
      license: manifest.license,
      name: manifest.name,
      packageRoot,
      version: manifest.version,
    });
  }
  return [...packages.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`
    )
  );
}

async function renderNotices() {
  const packages = await bundledPackages();
  assert.ok(packages.length > 0, 'bundle metafile contains no npm packages');
  const sections = [
    '# Third-party notices',
    '',
    'This file is generated from the npm packages included in `dist/index.js`.',
    'Run `npm run generate:third-party-notices` after changing bundled dependencies.',
    '',
  ];

  for (const component of packages) {
    assert.ok(
      typeof component.license === 'string' && component.license.trim(),
      `${component.name}@${component.version} has no declared license`
    );
    const materials = await licenseMaterials(component.packageRoot);
    assert.ok(
      materials.length > 0,
      `${component.name}@${component.version} has no bundled LICENSE, NOTICE, or README license section`
    );
    sections.push(
      `## ${component.name}@${component.version}`,
      '',
      `Declared license: ${component.license}`,
      ''
    );
    for (const material of materials) {
      assert.ok(material.text, `${component.name}: ${material.name} is empty`);
      sections.push(
        `### ${material.name}`,
        '',
        '```text',
        material.text,
        '```',
        ''
      );
    }
  }
  return `${sections.join('\n').trim()}\n`;
}

const generated = await renderNotices();
if (mode === '--write') {
  await writeFile(noticePath, generated);
  process.stdout.write(`Wrote ${path.relative(projectRoot, noticePath)}\n`);
} else {
  const current = await readFile(noticePath, 'utf8');
  assert.equal(
    current,
    generated,
    'THIRD_PARTY_NOTICES.md is stale; run npm run generate:third-party-notices'
  );
  process.stdout.write('THIRD_PARTY_NOTICES.md matches the bundle metafile\n');
}
