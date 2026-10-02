import { randomUUID } from 'node:crypto';
import { writeFile, rename, rm } from 'node:fs/promises';

export function snapshotProviders(snapshot) {
  const providers = snapshot?.providers;
  return providers && typeof providers === 'object' && !Array.isArray(providers)
    ? providers
    : {};
}

export async function writeLogoSnapshot(output, snapshot) {
  const temporary = new URL(`.provider-logos-${randomUUID()}.tmp`, output);
  try {
    await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', {
      flag: 'wx',
    });
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}
