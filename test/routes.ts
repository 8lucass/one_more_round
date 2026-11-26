// The four scripted routes used to compare builds (Node tests and the browser
// e2e). Their scores must not change while only presentation changes.
//   passive → no key press at all
//   safe    → planner: let every +500 pass, no crash
//   mixed   → crash at 10.0 s (no move), +500 A grabbed and escaped,
//             +500 B let pass, +500 C grabbed with a late escape (crash),
//             leaves the final line early
//   risky   → planner: every +500 grabbed and escaped, no crash
import { TRACK } from '../src/track.ts';
import { plan, type Input } from './planner.ts';

const parse = (s: string): Input[] =>
  s.split(' ').map((x) => ({ t: Number(x.slice(0, -1)), dir: x.endsWith('L') ? -1 : 1 }));

export interface Route {
  name: 'passive' | 'safe' | 'mixed' | 'risky';
  inputs: Input[];
  expected: { score: number; crashes: number; normalCores: number; bigCores: number };
}

export const ROUTES: Route[] = [
  { name: 'passive', inputs: [], expected: { score: 1300, crashes: 6, normalCores: 8, bigCores: 1 } },
  { name: 'safe', inputs: plan(TRACK, 'safe')!, expected: { score: 1800, crashes: 0, normalCores: 18, bigCores: 0 } },
  {
    name: 'mixed',
    inputs: parse('4.60L 6.00R 6.20R 7.80L 12.00L 14.30R 14.50R 17.40L 17.60L 18.00R 18.60L 21.40R 21.60R 25.40L 25.60L 25.80R 26.00R 26.65L 28.00R'),
    expected: { score: 2400, crashes: 2, normalCores: 14, bigCores: 2 },
  },
  { name: 'risky', inputs: plan(TRACK, 'greedy')!, expected: { score: 3100, crashes: 0, normalCores: 16, bigCores: 3 } },
];

export const route = (name: Route['name']): Route => ROUTES.find((r) => r.name === name)!;
