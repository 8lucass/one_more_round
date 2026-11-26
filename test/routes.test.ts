import assert from 'node:assert/strict';
import { test } from 'node:test';
import { play } from './planner.ts';
import { ROUTES } from './routes.ts';

// Reference scores of the four scripted routes. A frame of input lag (17 ms)
// must not change them, so the browser e2e can replay them in real time.
test('SCRIPTED ROUTES: passive 1300, safe 1800, mixed 2400, risky 3100 (also with 17 ms input lag)', () => {
  for (const r of ROUTES) {
    for (const lag of [0, 0.017]) {
      const s = play(r.inputs.map((i) => ({ ...i, t: i.t + lag }))).stats;
      const got = { score: s.score, crashes: s.crashes, normalCores: s.cores - s.bigCores, bigCores: s.bigCores };
      assert.deepEqual(got, r.expected, `${r.name} route, lag ${lag * 1000} ms`);
    }
    console.log(`    ${r.name}: ${r.expected.score}`);
  }
});
