import assert from 'node:assert/strict';
import test from 'node:test';
import { parseParticipantBindings, verifiedParticipantOwner, canRecordForOwner, participantEmailDirectory } from './participant-identity';
import { verifiedAdminEmail } from './admin-identity';

const owners = new Set(['cohen', 'edan', 'weezbark', 'korm', 'jimmy', 'nana', 'drb-and-son', 'rob', 'joe']);
const configuration = Object.fromEntries([...owners].map(owner => [owner, `${owner}@example.com`]));
const bindings = parseParticipantBindings(JSON.stringify(configuration), owners);
const user = (email: string, status = 'verified') => ({ emailAddresses: [{ emailAddress: email, verification: { status } }] });

test('all nine participant mappings resolve only from verified email, case-insensitively', () => {
  assert.equal(bindings.size, 9);
  for (const owner of owners) {
    assert.equal(verifiedParticipantOwner(user(`  ${owner.toUpperCase()}@EXAMPLE.COM  `), bindings), owner);
    assert.equal(verifiedParticipantOwner(user(`${owner}@example.com`, 'unverified'), bindings), null);
  }
});
test('participants cannot act for any other roster; the administrator retains all-roster access', () => {
  for (const owner of owners) {
    for (const target of owners) assert.equal(canRecordForOwner({ ownerId: owner, isAdmin: false }, target), owner === target);
    assert.equal(canRecordForOwner({ ownerId: 'edan', isAdmin: true }, owner), true);
  }
  assert.equal(verifiedAdminEmail(user('edan@example.com'), 'EDAN@example.com'), 'edan@example.com');
  assert.equal(verifiedAdminEmail(user('cohen@example.com'), 'edan@example.com'), null);
});
test('unlinked, banned, locked and ambiguous accounts are denied participant ownership', () => {
  assert.equal(verifiedParticipantOwner(user('outsider@example.com'), bindings), null);
  assert.equal(verifiedParticipantOwner({ ...user('cohen@example.com'), banned: true }, bindings), null);
  assert.equal(verifiedParticipantOwner({ ...user('cohen@example.com'), locked: true }, bindings), null);
  assert.equal(verifiedParticipantOwner({ emailAddresses: [...user('cohen@example.com').emailAddresses, ...user('jimmy@example.com').emailAddresses] }, bindings), null);
  assert.equal(canRecordForOwner({ ownerId: null, isAdmin: false }, 'cohen'), false);
});
test('bad JSON, unknown roster IDs and duplicate emails fail closed without exposing addresses', () => {
  assert.equal(parseParticipantBindings(undefined, owners).size, 0);
  assert.throws(() => parseParticipantBindings('[]', owners));
  assert.throws(() => parseParticipantBindings('not json', owners));
  assert.throws(() => parseParticipantBindings('{"unknown":"a@example.com"}', owners));
  assert.throws(() => parseParticipantBindings('{"cohen":"SAME@example.com","jimmy":"same@example.com"}', owners));
});

test('private administrator directory lists every roster using current names and marks only the configured admin', () => {
  const rows = participantEmailDirectory([...owners].map(id => ({ id, name: id.toUpperCase() })), bindings, 'EDAN@example.com');
  assert.equal(rows.length, 9);
  for (const row of rows) {
    assert.equal(row.email, `${row.ownerId}@example.com`);
    assert.equal(row.isAdmin, row.ownerId === 'edan');
  }
  assert.deepEqual(participantEmailDirectory([{ id: 'new', name: 'New team' }], bindings, undefined),
    [{ ownerId: 'new', ownerName: 'New team', email: null, isAdmin: false }]);
});