// End-to-end check in a real (headless) Chromium, loading dist/index.html
// straight from disk. Plays three full rounds in real time (~2 minutes):
//   Player 1, round 1: safe route        → no crash, no high-value core
//   Player 1, round 2: "One more round"  → risky route, all high-value cores, no crash
//   "Finish" → closing → next player
//   Player 2, round 1: no input          → crashes, streak resets, run still ends
// Key presses are dispatched as real keydown events at the planned course times.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { TRACK } from '../src/track.ts';
import { plan } from './planner.ts';

// Use the project's playwright if installed, otherwise a global one (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const url = pathToFileURL(resolve('dist/index.html')).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? '  ✔' : '  ✖'} ${msg}`);
  if (!cond) failures++;
}
const snap = () => page.evaluate(() => window.omr.snapshot());
const waitScreen = (s, timeout = 45000) =>
  page.waitForFunction((s) => window.omr.snapshot().screen === s, s, { timeout, polling: 50 });
const waitUnlocked = () => page.waitForFunction(() => !window.omr.snapshot().locked, null, { polling: 50 });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

/** Dispatch keydowns at sim times; take screenshots at given sim times. */
async function playRound(inputs, shots = {}) {
  const shotTimes = Object.entries(shots).sort((a, b) => a[1] - b[1]);
  await waitScreen('playing');
  let k = 0;
  // Inputs are fired inside the page (frame-accurate); screenshots from here.
  const done = page.evaluate(
    (inputs) =>
      new Promise((res) => {
        let i = 0;
        const tick = () => {
          const s = window.omr.snapshot();
          while (s.screen === 'playing' && i < inputs.length && inputs[i].t <= s.time + 0.004) {
            const key = inputs[i].dir < 0 ? 'ArrowLeft' : 'ArrowRight';
            window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
            i++;
          }
          if (s.screen !== 'playing' || i >= inputs.length) res(i);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    inputs,
  );
  for (const [name, t] of shotTimes) {
    await page.waitForFunction((t) => window.omr.snapshot().time >= t, t, { polling: 'raf', timeout: 40000 });
    await shot(name);
    k++;
  }
  const fired = await done;
  check(fired === inputs.length, `all ${inputs.length} planned key presses delivered (${fired})`);
  await waitScreen('results');
  await waitUnlocked();
  return snap();
}

await page.goto(url);
await page.waitForFunction(() => !!window.omr);
await shot('01-title');
check((await snap()).screen === 'title', 'title screen shown');

// ── Player 1, round 1: safe route ────────────────────────────────────
await page.waitForTimeout(700);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await shot('02-countdown');
const safe = plan(TRACK, 'safe');
console.log('Round 1 — safe route');
let s = await playRound(safe, { '03-phase1-cores': 2.0, '04-phase2-barriers': 9.4, '05-risk-ahead': 16.3, '06-risk-closer': 17.3 });
await shot('07-results-round1');
let r = s.results[0];
check(r.crashes === 0, `no crashes (${r.crashes})`);
check(r.bigCores === 0, `no high-value core taken (${r.bigCores})`);
check(r.score === 1800, `score 1800 (${r.score})`);
check(s.buttons.join() === 'rematch,finish', `buttons: ${s.buttons.join(', ')}`);

// ── Round 2: One more round, risky route ─────────────────────────────
await page.keyboard.press('Enter'); // "One more round" is focused
await waitScreen('countdown', 3000);
s = await snap();
check(s.round === 2 && s.time === 0, 'rematch restarts the same course from 0 (round 2)');
console.log('Round 2 — risky route');
const risky = plan(TRACK, 'greedy');
s = await playRound(risky, { '08-big-core-grab': 17.95, '09-escape': 18.25 });
await shot('10-results-round2');
r = s.results[1];
check(r.crashes === 0, `no crashes (${r.crashes})`);
check(r.bigCores === 3, `all high-value cores collected (${r.bigCores}/3)`);
check(r.score > s.results[0].score, `risky score ${r.score} > safe score ${s.results[0].score}`);
check(r.coresTotal === s.results[0].coresTotal, 'same course both rounds');
check(s.buttons.join() === 'finish', `only one rematch: buttons now = ${s.buttons.join(', ')}`);

// Right arrow must not reveal a hidden rematch.
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await waitScreen('closing', 3000);
await page.waitForTimeout(300);
await shot('11-closing');
check(true, 'Finish → closing screen');

// ── Next player ──────────────────────────────────────────────────────
await waitUnlocked();
await page.keyboard.press('Enter');
await waitScreen('title', 3000);
s = await snap();
check(s.round === 1 && s.results.length === 0, 'closing → fresh title for the next player');
await waitUnlocked();
await page.keyboard.press('Space');
await waitScreen('playing', 5000);

// Real Playwright key presses: lane changes are immediate.
console.log('Player 2 — crash run (+ live key checks)');
const lane0 = (await snap()).lane;
await page.keyboard.press('ArrowLeft');
const lane1 = (await snap()).lane;
await page.waitForTimeout(40);
await shot('12-lane-change-40ms');
check(lane0 === 1 && lane1 === 0, `ArrowLeft switches lane instantly (${lane0} → ${lane1})`);
await page.keyboard.press('ArrowLeft');
check((await snap()).lane === 0, 'left edge blocks the move');
await page.keyboard.down('ArrowRight'); // holding should move exactly one lane
// Simulate the OS key auto-repeat that a held key produces.
await page.evaluate(() => {
  for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true }));
});
await page.waitForTimeout(200);
await page.keyboard.up('ArrowRight');
check((await snap()).lane === 1, 'holding → moves exactly one lane');

// Then stay in the centre: crash into the centre barriers.
await page.waitForFunction(() => window.omr.snapshot().stats.crashes >= 1, null, { timeout: 15000, polling: 'raf' });
await page.waitForTimeout(120);
await shot('13-crash');
s = await snap();
check(s.stats.crashes === 1 && s.stats.streak === 0, 'crash: streak reset to 0');
check(s.screen === 'playing', 'the run continues after the crash');
await waitScreen('results');
await waitUnlocked();
s = await snap();
r = s.results[0];
check(r.crashes >= 3, `crashes counted (${r.crashes})`);
check(r.streak === 4 && r.bestStreak >= 4, `streak rebuilt after last crash (streak ${r.streak}, best ${r.bestStreak})`);
await shot('14-results-crash-run');

// Click "Finish" with the mouse this time.
const box = await page.locator('#game').boundingBox();
const scale = Math.min(box.width / 960, box.height / 540);
const ox = (box.width - 960 * scale) / 2;
const oy = (box.height - 540 * scale) / 2;
await page.mouse.click(box.x + ox + (480 + 14 + 125) * scale, box.y + oy + (418 + 29) * scale);
await waitScreen('closing', 3000);
check(true, 'mouse click on Finish works');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll end-to-end checks passed');
process.exit(failures ? 1 : 0);
