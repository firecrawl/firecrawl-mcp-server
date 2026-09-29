import assert from 'node:assert/strict';

const DAY_MS = 86_400_000;

/**
 * Keyless recovery links carry the UTC date the prompt was shown
 * (utm_content=YYYY-MM-DD). Checks the date is today or yesterday, since a run
 * can cross midnight UTC, and strips it so the rest of the message can be
 * compared exactly.
 */
export function withoutPromptDate(text) {
  const match = text.match(/&utm_content=(\d{4}-\d{2}-\d{2})/);
  assert.ok(match, `keyless recovery link carries the prompt date: ${text}`);
  const age = Date.now() - Date.parse(`${match[1]}T00:00:00Z`);
  assert.ok(
    age >= 0 && age < 2 * DAY_MS,
    `prompt date ${match[1]} is today or yesterday (UTC)`
  );
  return text.replace(match[0], '');
}
