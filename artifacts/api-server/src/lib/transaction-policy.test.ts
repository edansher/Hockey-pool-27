import assert from 'node:assert/strict';
import test from 'node:test';
import { draftRosterSelectionSchema } from '../../../../lib/db/src/schema/draft-rosters';
import { requireSkaterDrop, requireSkaterPickup } from './transaction-policy';

test('named goalies inside a grouped pick cannot be dropped', () => {
  const goalie = { ...draftRosterSelectionSchema.parse({
    round: 1, originalText: 'G: Boston', assetType: 'goalieTeam', position: 'G', reviewNote: null,
  }), goalies: [{ nhlPlayerId: 123 }] };
  assert.throws(() => requireSkaterDrop([goalie], 123), /Goalies cannot be dropped/);
  assert.throws(() => requireSkaterPickup('G'), /Goalie transactions are not allowed/);
});

test('only an actively owned skater can be dropped; F and D pickups are allowed', () => {
  const skater = draftRosterSelectionSchema.parse({
    round: 2, originalText: 'Test Skater', nhlPlayerId: 456, assetType: 'skater', position: 'F', reviewNote: null,
  });
  assert.equal(requireSkaterDrop([skater], 456).round, 2);
  assert.throws(() => requireSkaterDrop([{ ...skater, droppedAt: '2026-10-02T13:14:01Z' }], 456), /not actively owned/);
  assert.throws(() => requireSkaterDrop([skater], 999), /not actively owned/);
  requireSkaterPickup('F'); requireSkaterPickup('D');
});