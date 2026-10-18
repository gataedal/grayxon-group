const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCapabilities, canPerformAction } = require('./permissions.js');

const training = { id: 'training-1', created_by: 'manager-host' };

test('training creator is host and can moderate/end', () => {
  const caps = resolveCapabilities({ userId: 'manager-host', globalRole: 'manager', training });
  assert.equal(caps.isHost, true);
  assert.equal(caps.canModerate, true);
  assert.equal(caps.canEndForAll, true);
});

test('Grayxon admin keeps full controls when not the creator', () => {
  const caps = resolveCapabilities({ userId: 'admin-1', globalRole: 'admin', training });
  assert.equal(caps.isHost, false);
  assert.equal(caps.isAdmin, true);
  assert.equal(caps.canModerate, true);
  assert.equal(caps.canEndForAll, true);
});

test('invited manager or creator remains a normal participant', () => {
  for (const globalRole of ['manager', 'creator']) {
    const caps = resolveCapabilities({ userId: 'invitee-1', globalRole, training });
    assert.equal(caps.canEnter, true);
    assert.equal(caps.canModerate, false);
    assert.equal(caps.canEndForAll, false);
    assert.equal(caps.canPromoteParticipants, false);
  }
});

test('unauthenticated or missing training cannot act', () => {
  const anonymous = resolveCapabilities({ userId: '', globalRole: 'admin', training });
  const missingTraining = resolveCapabilities({ userId: 'admin-1', globalRole: 'admin', training: null });
  assert.equal(anonymous.canEnter, false);
  assert.equal(missingTraining.canEnter, false);
  assert.equal(canPerformAction(anonymous, 'end-for-all'), false);
  assert.equal(canPerformAction(missingTraining, 'moderate'), false);
});

test('participants can leave but cannot use privileged actions', () => {
  const caps = resolveCapabilities({ userId: 'invitee-1', globalRole: 'creator', training });
  assert.equal(canPerformAction(caps, 'leave'), true);
  assert.equal(canPerformAction(caps, 'moderate'), false);
  assert.equal(canPerformAction(caps, 'promote'), false);
  assert.equal(canPerformAction(caps, 'end-for-all'), false);
});

test('unknown actions fail closed', () => {
  const caps = resolveCapabilities({ userId: 'manager-host', globalRole: 'manager', training });
  assert.equal(canPerformAction(caps, 'make-everyone-admin'), false);
});
