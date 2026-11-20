// Route planner used by the tests: finds the best lane sequence through the
// fixed course under human-ish limits (at most one lane change every 0.15 s).
//   'safe'   → never touches a high-value core, never hits a barrier
//   'greedy' → maximises points (takes the high-value cores), never hits a barrier

import { BIG_CORE_POINTS, CORE_POINTS, LANES, RUN_DURATION, SIM_DT } from '../src/config.ts';
import { Sim } from '../src/sim.ts';
import type { TrackItem } from '../src/track.ts';

const G = 0.05; // planning grid (s)
const COOLDOWN = 3; // grid steps between lane changes (0.15 s)
const BARRIER_MARGIN = 0.1; // must be out of a barrier's lane ±this around its crossing
const BIG_AVOID_MARGIN = 0.12; // safe route stays out of the big-core lane ±this

export interface Input {
  t: number;
  dir: -1 | 1;
}

export function plan(track: readonly TrackItem[], mode: 'safe' | 'greedy'): Input[] | null {
  const N = Math.ceil(RUN_DURATION / G) + 1;
  const forbidden: boolean[][] = Array.from({ length: N }, () => new Array(LANES).fill(false));
  const reward: number[][] = Array.from({ length: N }, () => new Array(LANES).fill(0));
  const mark = (t: number, m: number, lane: number) => {
    for (let i = Math.max(0, Math.floor((t - m) / G)); i <= Math.min(N - 1, Math.ceil((t + m) / G)); i++) forbidden[i][lane] = true;
  };
  for (const o of track) {
    if (o.kind === 'barrier') mark(o.t, BARRIER_MARGIN, o.lane);
    else if (o.kind === 'bigCore' && mode === 'safe') mark(o.t, BIG_AVOID_MARGIN, o.lane);
    else reward[Math.round(o.t / G)][o.lane] += o.kind === 'bigCore' ? BIG_CORE_POINTS : CORE_POINTS;
  }

  // value[i][lane][cd]: best future reward from index i.
  const NEG = -1e9;
  const value = Array.from({ length: N + 1 }, () => Array.from({ length: LANES }, () => new Array(COOLDOWN + 1).fill(0)));
  const choice = Array.from({ length: N }, () => Array.from({ length: LANES }, () => new Array(COOLDOWN + 1).fill(0)));
  for (let i = N - 1; i >= 0; i--) {
    for (let l = 0; l < LANES; l++) {
      for (let cd = 0; cd <= COOLDOWN; cd++) {
        if (forbidden[i][l]) {
          value[i][l][cd] = NEG;
          continue;
        }
        // Next state: stay, or change lane if the cooldown allows.
        let best = value[i + 1][l][Math.min(COOLDOWN, cd + 1)];
        let pick = 0;
        if (cd >= COOLDOWN && i + 1 < N) {
          for (const d of [-1, 1]) {
            const nl = l + d;
            if (nl < 0 || nl >= LANES) continue;
            const v = value[i + 1][nl][0] - 0.01; // tiny cost: prefer fewer moves
            if (v > best) {
              best = v;
              pick = d;
            }
          }
        }
        value[i][l][cd] = best <= NEG / 2 ? NEG : best + reward[i][l];
        choice[i][l][cd] = pick;
      }
    }
  }
  if (value[0][1][COOLDOWN] <= NEG / 2) return null;

  const inputs: Input[] = [];
  let l = 1;
  let cd = COOLDOWN;
  for (let i = 0; i < N - 1; i++) {
    const d = choice[i][l][cd];
    if (d !== 0) {
      inputs.push({ t: (i + 1) * G, dir: d as -1 | 1 });
      l += d;
      cd = 0;
    } else {
      cd = Math.min(COOLDOWN, cd + 1);
    }
  }
  return inputs;
}

/** Plays the course in the real simulation with timed key presses. */
export function play(inputs: readonly Input[], track?: readonly TrackItem[], startLane = 1): Sim {
  const sim = new Sim(track);
  sim.lane = startLane;
  let k = 0;
  while (!sim.finished) {
    while (k < inputs.length && inputs[k].t <= sim.time + 1e-9) sim.move(inputs[k++].dir);
    sim.step(SIM_DT);
  }
  return sim;
}
