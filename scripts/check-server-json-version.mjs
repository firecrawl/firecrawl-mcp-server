import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("server.json", "utf8"));

const errors = [];

if (manifest.version !== packageJson.version) {
  errors.push(
    `server.json version (${manifest.version}) does not match package.json (${packageJson.version})`,
  );
}

const npmPackage = (manifest.packages ?? []).find(
  (pkg) => pkg.registryType === "npm" && pkg.identifier === "firecrawl-mcp",
);

if (!npmPackage) {
  errors.push("server.json is missing firecrawl-mcp npm package entry");
} else if (npmPackage.version !== packageJson.version) {
  errors.push(
    `server.json packages[firecrawl-mcp].version (${npmPackage.version}) does not match package.json (${packageJson.version})`,
  );
}

if (errors.length > 0) {
  console.error("server.json version check failed:\n- " + errors.join("\n- "));
  console.error("\nRun: pnpm run sync:server-json");
  process.exit(1);
}

console.log(`server.json version matches package.json (${packageJson.version})`);
