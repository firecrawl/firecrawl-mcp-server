import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('hosted keyless client evidence shows no automatic OAuth from /v2/mcp initialize', async () => {
  const evidence = JSON.parse(
    await readFile('tests/fixtures/generated/hosted-mcp-client-evidence.json', 'utf8')
  );

  assert.equal(evidence.safety.real_user_config_mutated, false);
  assert.equal(evidence.safety.external_authentication_attempted, false);

  const keylessReplays = evidence.local_replay.filter(
    (entry) => entry.mock_mode === 'keyless_200_with_prm'
  );
  assert.deepEqual(
    keylessReplays.map((entry) => entry.client).sort(),
    ['claude', 'codex']
  );

  for (const replay of keylessReplays) {
    assert.equal(replay.server_url.endsWith('/v2/mcp'), true);
    assert.equal(replay.temp_home_removed, true);
    assert.equal(replay.assertions.real_user_config_mutated, false);
    assert.equal(replay.assertions.as_metadata_requested, false);
    assert.equal(replay.assertions.dcr_requested, false);
    assert.equal(replay.assertions.authorize_requested, false);
  }

  assert.ok(
    evidence.expected_assertions.includes(
      'A 200 initialize response never causes an automatic browser OAuth flow'
    )
  );
});
