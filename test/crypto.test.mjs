import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptJson, decryptJson } from '../scripts/crypto.mjs';

test('stats round-trip with the right password; wrong password is rejected', async () => {
  const text = JSON.stringify({ meta: { division: 'x' }, n: [1, 2, 3] });
  const env = await encryptJson(text, 'correct horse');
  assert.ok(!env.ct.includes('division'), 'ciphertext must not contain plaintext');
  assert.equal(await decryptJson(env, 'correct horse'), text);
  await assert.rejects(() => decryptJson(env, 'wrong horse'));
});
