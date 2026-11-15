import test from 'node:test';
import assert from 'node:assert/strict';
import { localClockAngles, mechanicalAngles } from './movement.js';

test('local clock uses local hours and continuous minute/hour fractions', () => {
  const date = new Date(2026, 10, 15, 15, 15, 30, 500);
  const angles = localClockAngles(date);
  assert.ok(Math.abs(angles.hour * -180 / Math.PI - (90 + 7.5 + 30.5 / 120)) < 1e-9);
  assert.ok(Math.abs(angles.minute * -180 / Math.PI - 93.05) < 1e-9);
  assert.equal(angles.beatSeconds, 30.5);
  assert.equal(localClockAngles(new Date(2026, 10, 16, 0, 0, 0, 0)).hour, -0);
});

test('sweep advances once per 125ms and wraps at the minute', () => {
  const at = milliseconds => localClockAngles(new Date(2026, 10, 15, 10, 9, 4, milliseconds)).second;
  assert.equal(at(0), at(124));
  assert.ok(Math.abs((at(125) - at(124)) * -180 / Math.PI - .75) < 1e-9);
  assert.equal(at(125), at(249));
  assert.equal(localClockAngles(new Date(2026, 10, 15, 10, 10, 0)).second, -0);
});

test('meshing tooth displacement cancels and tourbillon makes one revolution per minute', () => {
  const angles = mechanicalAngles(7.3);
  assert.ok(Math.abs(36 * angles.GreatWheel_36T + 12 * angles.Pinion_12T) < 1e-10);
  assert.ok(Math.abs(12 * angles.Pinion_12T + 20 * angles.IntermediateWheel_20T) < 1e-10);
  assert.ok(Math.abs(mechanicalAngles(60).TourbillonCage + 2 * Math.PI) < 1e-12);
  assert.ok(Math.abs(mechanicalAngles(.0625).BalanceWheel - .55) < 1e-9);
  assert.ok(Math.abs(mechanicalAngles(.1875).BalanceWheel + .55) < 1e-9);
});
