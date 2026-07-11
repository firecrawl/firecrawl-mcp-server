import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('server.json', 'utf8'));
const expectedPackageName = packageJson.name;
const expectedMcpName = packageJson.mcpName;
const expectedVersion = packageJson.version;
const expectedRepositoryUrl = packageJson.repository?.url?.replace(/^git\+/, '');

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

check(
  manifest.$schema === 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
  'server.json must use the pinned MCP server schema URL'
);
check(
  manifest.name === expectedMcpName,
  `server.json name ${manifest.name} does not match package.json mcpName ${expectedMcpName}`
);
check(
  manifest.version === expectedVersion,
  `server.json version ${manifest.version} does not match package.json ${expectedVersion}`
);
check(
  manifest.repository?.url === expectedRepositoryUrl,
  `server.json repository URL ${manifest.repository?.url} does not match package.json ${expectedRepositoryUrl}`
);
check(
  manifest.repository?.source === 'github',
  'server.json repository source must remain github'
);

const npmPackage = (manifest.packages ?? []).find(
  (pkg) => pkg.registryType === 'npm' && pkg.identifier === expectedPackageName
);
if (!npmPackage) {
  failures.push(`server.json is missing npm package entry for ${expectedPackageName}`);
} else {
  check(
    npmPackage.version === expectedVersion,
    `server.json package ${expectedPackageName} version ${npmPackage.version} does not match package.json ${expectedVersion}`
  );
  check(
    npmPackage.transport?.type === 'stdio',
    'server.json npm package transport must remain stdio'
  );

  const firecrawlApiKey = (npmPackage.environmentVariables ?? []).find(
    (envVar) => envVar.name === 'FIRECRAWL_API_KEY'
  );
  if (!firecrawlApiKey) {
    failures.push('server.json package must declare FIRECRAWL_API_KEY');
  } else {
    check(firecrawlApiKey.isRequired === false, 'FIRECRAWL_API_KEY must remain optional');
    check(firecrawlApiKey.isSecret === true, 'FIRECRAWL_API_KEY must remain secret');
    check(firecrawlApiKey.format === 'string', 'FIRECRAWL_API_KEY format must remain string');
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`server.json matches ${expectedPackageName}@${expectedVersion}`);
