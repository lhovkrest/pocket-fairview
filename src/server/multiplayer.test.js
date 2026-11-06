import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, mutateMatch, publicMatch, settleDue} from './multiplayer.js';
import {HOOPS_SPOTS, idealPower} from '../shared/hoops.js';

const HOST = 'host-token-000000000000000000000000000000000000000000';
function lobby(game = 'hoops') {
  const r = createMatch('ABCD', HOST, 'shared', 1000, game);
  const a = mutateMatch(r, {op: 'join', name: 'Ada'}, 1000);
  const b = mutateMatch(r, {op: 'join', name: 'Bo'}, 1000);
  mutateMatch(r, {op: 'ready', token: a.token, ready: true}, 1000);
  mutateMatch(r, {op: 'ready', token: b.token, ready: true}, 1000);
  mutateMatch(r, {op: 'start', token: HOST}, 1000);
  return {r, a, b};
}

test('host can switch the lobby game before start', () => {
  const r = createMatch('ABCD', HOST, 'shared', 1000, 'golf');
  assert.equal(r.game, 'golf');
  mutateMatch(r, {op: 'settings', token: HOST, game: 'hoops'}, 1000);
  assert.equal(r.game, 'hoops');
  mutateMatch(r, {op: 'settings', token: HOST, game: 'golf', mode: 'multi'}, 1000);
  assert.equal(r.game, 'golf');
  assert.equal(r.mode, 'multi');
});

test('hoops turns, scoring and the buzzer', () => {
  const {r, a, b} = lobby();
  assert.equal(r.phase, 'ready');
  assert.equal(r.hole, 0);
  assert.equal(r.turn, a.playerId);

  // Only the player whose turn it is may shoot.
  assert.throws(() => mutateMatch(r, {op: 'shot', token: b.token, id: 'nope', power: 0.5, turnNumber: r.turnNumber}, 1000), /Wait for your turn/);

  const spot = HOOPS_SPOTS[0];
  mutateMatch(r, {op: 'shot', token: a.token, id: 'shot-0', power: idealPower(spot), turnNumber: r.turnNumber}, 1000);
  assert.equal(r.phase, 'flight');
  assert.equal(r.shot.result, 'made');
  assert.equal(r.shot.points, spot.points);
  assert.equal(r.players.find(p => p.id === a.playerId).hscore, 0, 'score only lands after the ball settles');
  assert.equal(settleDue(r, r.shot.start + r.shot.duration + 1), true);
  assert.equal(r.phase, 'ready');
  assert.equal(r.turn, b.playerId, 'turn passes to the other player in the same round');
  assert.equal(r.players.find(p => p.id === a.playerId).hscore, spot.points);

  // Play the rest of the shootout with perfect power from each spot.
  let clock = r.shot.start + r.shot.duration + 2;
  let guard = 0;
  while (r.phase === 'ready' && guard < 20) {
    const shooter = r.players.find(p => p.id === r.turn);
    const nextSpot = HOOPS_SPOTS[r.hole];
    mutateMatch(r, {op: 'shot', token: shooter.token, id: `shot-${guard + 1}`, power: idealPower(nextSpot), turnNumber: r.turnNumber}, clock);
    clock = r.shot.start + r.shot.duration + 1;
    settleDue(r, clock);
    guard++;
  }
  assert.equal(guard, 9, 'nine shots after the opener fill the five-round schedule');
  assert.equal(r.phase, 'finished');
  const expected = HOOPS_SPOTS.reduce((sum, s) => sum + s.points, 0);
  for (const p of r.players) {
    assert.equal(p.hscore, expected, `${p.name} total`);
    assert.equal(p.hmakes, HOOPS_SPOTS.length);
    assert.equal(p.hshots.length, HOOPS_SPOTS.length);
  }

  const view = publicMatch(r, clock);
  assert.equal(view.game, 'hoops');
  assert.equal(view.holes, 5);
  assert.equal(view.phase, 'finished');
  assert.ok(!('token' in view.players[0]), 'tokens never leave the server');
  assert.ok(view.last && view.last.result === 'made');
});

test('a forfeited player is skipped for the rest of the shootout', () => {
  const {r, a, b} = lobby();
  mutateMatch(r, {op: 'remove', token: HOST, playerId: b.playerId}, 1000);
  assert.equal(r.players.find(p => p.id === b.playerId).forfeit, true);
  assert.equal(r.phase, 'ready');
  assert.equal(r.turn, a.playerId);
  let clock = 1000;
  for (let i = 0; i < 5; i++) {
    const spot = HOOPS_SPOTS[r.hole];
    mutateMatch(r, {op: 'shot', token: a.token, id: `solo-${i}`, power: idealPower(spot), turnNumber: r.turnNumber}, clock);
    clock = r.shot.start + r.shot.duration + 1;
    settleDue(r, clock);
    assert.equal(r.phase, i < 4 ? 'ready' : 'finished');
  }
  assert.equal(r.players.find(p => p.id === a.playerId).hscore, HOOPS_SPOTS.reduce((s, x) => s + x.points, 0));
});

test('golf matches still start and settle through the same state machine', () => {
  const {r, a} = lobby('golf');
  assert.equal(r.game, 'golf');
  assert.equal(r.phase, 'ready');
  assert.equal(r.turn, a.playerId);
  mutateMatch(r, {op: 'shot', token: a.token, id: 'golf-0', power: 0.65, aim: 0, club: 'driver', turnNumber: r.turnNumber}, 1000);
  assert.equal(r.phase, 'flight');
  assert.ok(Array.isArray(r.shot.path) && r.shot.path.length > 4);
  const after = r.shot.start + r.shot.duration + 1;
  assert.equal(settleDue(r, after), true);
  assert.notEqual(r.phase, 'flight');
});
