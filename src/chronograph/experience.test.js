import test from 'node:test';
import assert from 'node:assert/strict';
import { sapphireSheen } from './optics.js';
import { tickSamples } from './escapement-audio.js';

test('sapphire is invisible head-on, gently reflective at grazing angles', () => {
  assert.equal(sapphireSheen(1), 0);
  assert.equal(sapphireSheen(-1), 0);
  assert.equal(sapphireSheen(.95), 0);
  assert.ok(sapphireSheen(.5) > 0 && sapphireSheen(.5) < 1);
  assert.equal(sapphireSheen(0), 1);
});
test('synthesized pallet clicks are short, bounded and decay without discontinuities', () => {
  for (const rate of [44100, 48000]) {
    const data = tickSamples(rate);
    assert.equal(data.length, Math.ceil(rate * .018));
    assert.ok(data[0] === 0);
    assert.ok(Math.max(...data.map(Math.abs)) < .8);
    assert.ok(Math.abs(data.at(-1)) < .0002);
    assert.notDeepEqual(data, tickSamples(rate, true));
  }
});
