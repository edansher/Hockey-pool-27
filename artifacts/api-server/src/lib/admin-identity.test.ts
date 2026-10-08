import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedAdminEmail, type AdminIdentity } from './admin-identity';

const account = (emailAddress: string, status = 'verified'): AdminIdentity => ({
  emailAddresses: [{ emailAddress, verification: { status } }],
});
test('only a verified exact configured address grants administrator access', () => {
  assert.equal(verifiedAdminEmail(account('Creator@example.test'), 'creator@example.test'), 'Creator@example.test');
  assert.equal(verifiedAdminEmail(account('creator@example.test', 'unverified'), 'creator@example.test'), null);
  assert.equal(verifiedAdminEmail(account('participant@example.test'), 'creator@example.test'), null);
  assert.equal(verifiedAdminEmail(account('creator@example.test.attacker.test'), 'creator@example.test'), null);
});
test('absent configuration, missing verification, and inactive accounts fail closed', () => {
  const user = account('creator@example.test');
  assert.equal(verifiedAdminEmail(user, undefined), null);
  assert.equal(verifiedAdminEmail({ emailAddresses: [] }, 'creator@example.test'), null);
  assert.equal(verifiedAdminEmail({ emailAddresses: [{ emailAddress: 'creator@example.test', verification: null }] }, 'creator@example.test'), null);
  assert.equal(verifiedAdminEmail({ ...user, banned: true }, 'creator@example.test'), null);
  assert.equal(verifiedAdminEmail({ ...user, locked: true }, 'creator@example.test'), null);
});