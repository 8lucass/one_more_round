import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD_REPEAT } from '../src/config.ts';
import { HoldRepeat } from '../src/hold.ts';

// Times in seconds. The press itself already moved one lane (main.ts); `poll`
// only answers whether ONE extra lane is due.

test('HOLD: a short tap (released before the threshold) never adds a lane', () => {
  const h = new HoldRepeat();
  for (const ms of [30, 60, 100, 150, HOLD_REPEAT * 1000 - 5]) {
    h.press(-1, 10);
    h.release(-1);
    assert.equal(h.poll(10 + ms / 1000, 1), 0, `tap of ${ms} ms`);
    assert.equal(h.poll(11, 1), 0, `tap of ${ms} ms, later`);
  }
});

test('HOLD: held ← from the right lane crosses to the left lane once, then stops', () => {
  const h = new HoldRepeat();
  h.press(-1, 5); // right (2) → centre (1) on the press
  assert.equal(h.poll(5 + HOLD_REPEAT - 0.01, 1), 0, 'not before the threshold');
  assert.equal(h.poll(5 + HOLD_REPEAT, 1), -1, 'centre → left at the threshold');
  assert.equal(h.poll(5 + 2 * HOLD_REPEAT, 0), 0, 'only one extra lane per press');
  assert.equal(h.held, 0);
});

test('HOLD: held → crosses the other way too', () => {
  const h = new HoldRepeat();
  h.press(1, 0);
  assert.equal(h.poll(HOLD_REPEAT + 0.001, 1), 1);
});

test('HOLD: against the edge, no extra move (and so no extra bump)', () => {
  const h = new HoldRepeat();
  h.press(-1, 0); // the press itself moved centre → left, or bumped at the left edge
  assert.equal(h.poll(HOLD_REPEAT, 0), 0);
  assert.equal(h.poll(10, 0), 0);
});

test('HOLD: releasing the OTHER arrow does not cancel; a new press replaces the hold', () => {
  const h = new HoldRepeat();
  h.press(-1, 0);
  h.release(1);
  assert.equal(h.held, -1);
  h.press(1, 0.1); // the player switched arrows: only the new one counts, from its own press time
  assert.equal(h.poll(HOLD_REPEAT + 0.05, 1), 0, 'timer restarted');
  assert.equal(h.poll(0.1 + HOLD_REPEAT, 1), 1);
});

test('HOLD: clear (pause, focus loss, screen change) drops the pending move', () => {
  const h = new HoldRepeat();
  h.press(1, 0);
  h.clear();
  assert.equal(h.poll(1, 0), 0);
});

test('HOLD: two quick independent taps are two lanes, with no extra move', () => {
  const h = new HoldRepeat();
  // tap 1 (moves on press), released after 80 ms; tap 2 120 ms later, released after 80 ms
  h.press(-1, 0);
  h.release(-1);
  h.press(-1, 0.2);
  h.release(-1);
  assert.equal(h.poll(1, 0), 0);
});
