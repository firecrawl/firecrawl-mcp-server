import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('server.json', 'utf8'));
const expectedName = packageJson.name;
const expectedVersion = packageJson.version;

const failures = [];
if (manifest.version !== expectedVersion) {
  failures.push(`server.json version ${manifest.version} does not match package.json ${expectedVersion}`);
}

const npmPackage = (manifest.packages ?? []).find(
  (pkg) => pkg.registryType === 'npm' && pkg.identifier === expectedName
);
if (!npmPackage) {
  failures.push(`server.json is missing npm package entry for ${expectedName}`);
} else if (npmPackage.version !== expectedVersion) {
  failures.push(
    `server.json package ${expectedName} version ${npmPackage.version} does not match package.json ${expectedVersion}`
  );
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`server.json matches ${expectedName}@${expectedVersion}`);
