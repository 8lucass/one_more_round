import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIM_DT } from '../src/config.ts';
import { DodgeTracker } from '../src/feedback.ts';
import { Sim } from '../src/sim.ts';
import type { Input } from './planner.ts';
import { route } from './routes.ts';

/** Plays a route like main.ts does (drain after each press and after each step). */
function closeDodges(inputs: readonly Input[]): number[] {
  const sim = new Sim();
  const tracker = new DodgeTracker();
  const close: number[] = [];
  const collect = () => {
    for (const id of tracker.scan(sim.drainEvents(), sim.time)) close.push(sim.objects.find((o) => o.id === id)!.t);
  };
  let k = 0;
  while (!sim.finished) {
    while (k < inputs.length && inputs[k].t <= sim.time + 1e-9) {
      sim.move(inputs[k++].dir);
      collect();
    }
    sim.step(SIM_DT);
    collect();
  }
  return close;
}

test('CLOSE! only for barriers left at the last moment (presentation only)', () => {
  assert.deepEqual(closeDodges([]), [], 'never moving → no close dodge');
  // Safe route: leaves the centre at 9.90 for the 10.0 s barrier, and so on.
  const safe = closeDodges(route('safe').inputs);
  assert.ok(safe.includes(10), `safe route: 10.0 s is close (${safe.join(', ')})`);
  // Risky route: the escapes after each +500 are close calls.
  const risky = closeDodges(route('risky').inputs);
  for (const t of [18.75, 22.7, 26.6]) assert.ok(risky.includes(t), `risky route: escape before ${t} s is close (${risky.join(', ')})`);
});
