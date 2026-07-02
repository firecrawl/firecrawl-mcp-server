import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("server.json", "utf8"));

manifest.version = packageJson.version;

for (const pkg of manifest.packages ?? []) {
  if (pkg.registryType === "npm" && pkg.identifier === "firecrawl-mcp") {
    pkg.version = packageJson.version;
  }
}

fs.writeFileSync("server.json", JSON.stringify(manifest, null, 2) + "\n");

console.log(`Synced server.json to package.json version ${packageJson.version}`);
