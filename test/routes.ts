// The four scripted routes used to compare builds (Node tests and the browser
// e2e). Their scores must not change while only presentation changes.
// Phase 2 ("bank on clear", P09): a +500 only counts if its barrier is then
// passed without a crash, so passive 1300 → 800 and mixed 2400 → 1900.
//   passive → no key press at all
//   safe    → planner: let every +500 pass, no crash
//   mixed   → crash at 10.0 s (no move), +500 A grabbed and escaped (banked),
//             +500 B let pass, +500 C grabbed with a late escape (crash: lost),
//             leaves the final line early
//   risky   → planner: every +500 grabbed and escaped, no crash
import { TRACK } from '../src/track.ts';
import { plan, type Input } from './planner.ts';

const parse = (s: string): Input[] =>
  s.split(' ').map((x) => ({ t: Number(x.slice(0, -1)), dir: x.endsWith('L') ? -1 : 1 }));

export interface Route {
  name: 'passive' | 'safe' | 'mixed' | 'risky';
  inputs: Input[];
  /** bigCores = +500 grabbed; bigBanked = counted; bigLost = grabbed then crashed into its barrier. */
  expected: { score: number; crashes: number; normalCores: number; bigCores: number; bigBanked: number; bigLost: number };
}

export const ROUTES: Route[] = [
  { name: 'passive', inputs: [], expected: { score: 800, crashes: 6, normalCores: 8, bigCores: 1, bigBanked: 0, bigLost: 1 } },
  { name: 'safe', inputs: plan(TRACK, 'safe')!, expected: { score: 1800, crashes: 0, normalCores: 18, bigCores: 0, bigBanked: 0, bigLost: 0 } },
  {
    name: 'mixed',
    inputs: parse('4.60L 6.00R 6.20R 7.80L 12.00L 14.30R 14.50R 17.40L 17.60L 18.00R 18.60L 21.40R 21.60R 25.40L 25.60L 25.80R 26.00R 26.65L 28.00R'),
    expected: { score: 1900, crashes: 2, normalCores: 14, bigCores: 2, bigBanked: 1, bigLost: 1 },
  },
  { name: 'risky', inputs: plan(TRACK, 'greedy')!, expected: { score: 3100, crashes: 0, normalCores: 16, bigCores: 3, bigBanked: 3, bigLost: 0 } },
];

export const route = (name: Route['name']): Route => ROUTES.find((r) => r.name === name)!;
