import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIG_CORE_POINTS, CORE_POINTS, LANES, LOOKAHEAD, RUN_DURATION } from '../src/config.ts';
import { Sim } from '../src/sim.ts';
import { riskPairs, TRACK } from '../src/track.ts';
import { play, plan } from './planner.ts';

const barriers = TRACK.filter((o) => o.kind === 'barrier');
const cores = TRACK.filter((o) => o.kind === 'core');
const bigs = TRACK.filter((o) => o.kind === 'bigCore');

function barrierInLane(lane: number, from: number, to: number): boolean {
  return barriers.some((b) => b.lane === lane && b.t >= from && b.t <= to);
}

// ── Course design ────────────────────────────────────────────────────
test('course lasts ~30 s and every object fits inside it', () => {
  assert.equal(RUN_DURATION, 30);
  for (const o of TRACK) {
    assert.ok(o.t >= 2.5 && o.t <= RUN_DURATION - 0.5, `object at ${o.t}s`);
    assert.ok(o.lane >= 0 && o.lane < LANES);
  }
});

test('cores and barriers are introduced separately before any risk', () => {
  const firstBarrier = Math.min(...barriers.map((b) => b.t));
  const firstBig = Math.min(...bigs.map((b) => b.t));
  const phase1 = TRACK.filter((o) => o.t < firstBarrier);
  assert.ok(phase1.length >= 4 && phase1.every((o) => o.kind === 'core'), 'phase 1 = only normal cores');
  const phase2 = TRACK.filter((o) => o.t >= firstBarrier && o.t < firstBig - 1);
  assert.ok(phase2.length >= 3 && phase2.every((o) => o.kind === 'barrier'), 'phase 2 = only barriers');
});

test('every barrier row leaves at least one lane open', () => {
  for (const t of new Set(barriers.map((b) => b.t))) {
    const blocked = new Set(barriers.filter((b) => b.t === t).map((b) => b.lane));
    assert.ok(blocked.size < LANES, `wall at ${t}s`);
  }
});

test('each high-value core has a barrier right behind it, both visible well in advance', () => {
  const pairs = riskPairs();
  assert.equal(pairs.length, 3);
  for (const { core, barrier } of pairs) {
    const gap = barrier.t - core.t;
    assert.ok(gap >= 0.55 && gap <= 0.9, `gap ${gap.toFixed(2)}s at ${core.t}s`);
    // Barrier appears at the far end this long before the core reaches the ship.
    const seenBefore = LOOKAHEAD - gap;
    assert.ok(seenBefore >= 2.2, `barrier seen ${seenBefore.toFixed(2)}s before the core`);
    // An adjacent lane is free for the escape.
    const escape = [core.lane - 1, core.lane + 1].filter((l) => l >= 0 && l < LANES);
    assert.ok(escape.some((l) => !barrierInLane(l, core.t - 0.2, barrier.t + 0.5)), `escape lane at ${core.t}s`);
    // A safe lane exists for players who let the core pass.
    const safe = [0, 1, 2].filter((l) => l !== core.lane && !barrierInLane(l, core.t - 1.5, barrier.t + 0.5));
    assert.ok(safe.length > 0, `safe lane at ${core.t}s`);
  }
});

// ── Routes through the real simulation ───────────────────────────────
test('SAFE ROUTE: letting every high-value core pass completes the run with no crash', () => {
  const inputs = plan(TRACK, 'safe');
  assert.ok(inputs, 'a safe route exists');
  const sim = play(inputs!);
  const s = sim.stats;
  assert.equal(s.crashes, 0);
  assert.equal(s.bigCores, 0);
  assert.equal(s.cores, cores.length, 'safe route can still take every normal core');
  assert.equal(s.score, cores.length * CORE_POINTS);
  assert.equal(s.dodges, barriers.length);
  console.log(`    safe route: score ${s.score}, best streak ${s.bestStreak}, ${inputs!.length} key presses`);
});

test('RISKY ROUTE: grabbing every high-value core and escaping, no crash', () => {
  const inputs = plan(TRACK, 'greedy');
  assert.ok(inputs, 'a greedy route exists');
  const sim = play(inputs!);
  const s = sim.stats;
  assert.equal(s.crashes, 0);
  assert.equal(s.bigCores, bigs.length);
  assert.ok(s.score > cores.length * CORE_POINTS, 'risk pays more than the safe route');
  console.log(`    risky route: score ${s.score}, best streak ${s.bestStreak}, ${inputs!.length} key presses`);
});

test('RISKY ESCAPE with human reaction time: press 0.35 s after collecting', () => {
  for (const { core, barrier } of riskPairs()) {
    const escapeDir = core.lane === 0 ? 1 : -1;
    const sim = play([{ t: core.t + 0.35, dir: escapeDir }], [core, barrier], core.lane);
    assert.equal(sim.stats.bigCores, 1, `collected at ${core.t}s`);
    assert.equal(sim.stats.score, BIG_CORE_POINTS);
    assert.equal(sim.stats.crashes, 0, `escaped at ${core.t}s`);
  }
});

test('RISKY ESCAPE too late: pressing after the barrier arrives is a crash', () => {
  for (const { core, barrier } of riskPairs()) {
    const sim = play([{ t: barrier.t + 0.02, dir: core.lane === 0 ? 1 : -1 }], [core, barrier], core.lane);
    assert.equal(sim.stats.bigCores, 1);
    assert.equal(sim.stats.crashes, 1);
    assert.equal(sim.stats.streak, 0, 'streak reset by the crash');
  }
});

test('CRASH: staying in the centre crashes, resets the streak, and the run continues', () => {
  const sim = new Sim();
  let crashedWithStreak = false;
  let streakBefore = 0;
  while (!sim.finished) {
    streakBefore = sim.stats.streak;
    sim.step(1 / 120);
    for (const e of sim.drainEvents()) {
      if (e.type === 'crash') {
        if (streakBefore > 0) crashedWithStreak = true;
        assert.equal(sim.stats.streak, 0);
      }
    }
  }
  const s = sim.stats;
  assert.ok(s.crashes >= 3, `crashes: ${s.crashes}`);
  assert.ok(crashedWithStreak, 'a crash happened while holding a streak');
  assert.equal(sim.time >= RUN_DURATION, true, 'run reached the end');
  assert.equal(s.streak, 4, 'cores after the last crash rebuild the streak (finale line)');
  assert.ok(s.bestStreak >= 4);
});

test('one press = one lane; edges block and emit a bump', () => {
  const sim = new Sim([]);
  assert.equal(sim.lane, 1);
  assert.equal(sim.move(-1), true);
  assert.equal(sim.lane, 0);
  assert.equal(sim.move(-1), false);
  assert.equal(sim.lane, 0);
  assert.deepEqual(sim.drainEvents().map((e) => e.type), ['move', 'bump']);
  sim.move(1);
  sim.move(1);
  assert.equal(sim.lane, 2);
});

test('REMATCH: same course and same inputs give the identical result', () => {
  const inputs = plan(TRACK, 'greedy')!;
  const a = play(inputs).stats;
  const b = play(inputs).stats;
  assert.deepEqual(a, b);
});
