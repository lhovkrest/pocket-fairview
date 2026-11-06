import test from 'node:test';
import assert from 'node:assert/strict';
import {HOOPS_SPOTS, idealPower, idealSpeed, simulateHoopsShot, shotSpeed} from './hoops.js';

test('every spot has a makeable sweet spot', () => {
  for (const spot of HOOPS_SPOTS) {
    const ideal = idealPower(spot);
    assert.ok(ideal > 0.05 && ideal < 0.96, `${spot.name} ideal ${ideal}`);
    const shot = simulateHoopsShot(spot, ideal);
    assert.equal(shot.result, 'made', `${spot.name} at ${Math.round(ideal * 100)}%`);
    assert.equal(shot.points, spot.points);
    assert.equal(shot.swish, true);
    assert.equal(shot.idealPower, ideal);
  }
});

test('short and overcooked shots miss', () => {
  for (const spot of HOOPS_SPOTS) {
    assert.equal(simulateHoopsShot(spot, 0.02).result, 'miss', `${spot.name} short`);
    const strong = simulateHoopsShot(spot, Math.min(1, idealPower(spot) + 0.45));
    assert.equal(strong.result, 'miss', `${spot.name} long`);
  }
});

test('flight paths are time-ordered and always end', () => {
  for (const spot of HOOPS_SPOTS) {
    const shot = simulateHoopsShot(spot, idealPower(spot));
    assert.ok(shot.path.length > 12, `${spot.name} path samples`);
    for (let i = 1; i < shot.path.length; i++) {
      assert.ok(shot.path[i][0] >= shot.path[i - 1][0], `${spot.name} path order at ${i}`);
      assert.ok(Number.isFinite(shot.path[i][1]) && Number.isFinite(shot.path[i][2]) && Number.isFinite(shot.path[i][3]));
    }
    assert.ok(shot.end > 0.5 && shot.end <= 5.3, `${spot.name} end ${shot.end}`);
    assert.ok(shot.makeAt > 0 && shot.makeAt < shot.end);
  }
});

test('launch speed grows with power and distance', () => {
  assert.ok(shotSpeed(1) > shotSpeed(0.5));
  for (let i = 1; i < HOOPS_SPOTS.length; i++) {
    assert.ok(idealSpeed(HOOPS_SPOTS[i]) > idealSpeed(HOOPS_SPOTS[i - 1]));
  }
});
