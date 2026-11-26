// End-to-end check in a real (headless) Chromium, loading dist/index.html
// straight from disk (file://), with the network blocked. Plays four full
// rounds in real time with the scripted routes (~4 minutes):
//   Player 1, round 1: safe route (1800) → results lock + held ENTER
//   Player 1, round 2: "One more round" → risky route (3100), no tutorials
//   Finish → closing → ENTER → next player
//   Player 2, round 1: mixed route (2400) with focus-loss pauses → Finish
//                      (mouse) → closing → 45 s idle → title
//   Player 3, round 1: passive (1300) → Escape on results → title
//   Player 4: Escape from countdown / playing / paused, live key checks, M
//   Touch phone (emulated) with reduced motion: "Tap to play", tap lanes, no shake
// Key presses are dispatched as keydown events at the planned course times.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { route } from './routes.ts';

// Use the project's playwright if installed, otherwise a global one (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });
const url = pathToFileURL(resolve(process.env.OMR_PAGE || 'dist/index.html')).href;

const browser = await chromium.launch();
const errors = [];
let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? '  ✔' : '  ✖'} ${msg}`);
  if (!cond) failures++;
}

async function openPage(options) {
  const context = await browser.newContext(options);
  // Offline: any request other than the two local files is blocked and reported.
  await context.route('**/*', (r) => {
    const u = r.request().url();
    if (u.startsWith('file:')) return r.continue();
    errors.push(`network request: ${u}`);
    return r.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => !!window.omr);
  return page;
}

const page = await openPage({ viewport: { width: 1280, height: 720 } });

const snap = (p = page) => p.evaluate(() => window.omr.snapshot());
const waitScreen = (s, timeout = 45000, p = page) =>
  p.waitForFunction((s) => window.omr.snapshot().screen === s, s, { timeout, polling: 20 });
const waitUnlocked = (p = page) => p.waitForFunction(() => !window.omr.snapshot().locked, null, { polling: 20 });
const waitTime = (t, p = page) =>
  p.waitForFunction((t) => window.omr.snapshot().time >= t, t, { polling: 'raf', timeout: 60000 });
const shot = (name, p = page) => p.screenshot({ path: `${OUT}/${name}.png` });
const blur = () => page.evaluate(() => window.dispatchEvent(new Event('blur')));

/**
 * Plays one round. Inputs are fired inside the page at exact sim times (they
 * wait while the round is paused); `frames` are exact canvas captures taken in
 * the first frame whose sim time is ≥ t; `checkpoints` run from here once the
 * sim time passes t. Returns when the round has finished (FINISH banner).
 */
async function playRound(inputs, { frames = {}, checkpoints = [] } = {}) {
  await waitScreen('playing', 10000);
  const shots = Object.entries(frames).map(([name, t]) => ({ name, t }));
  const done = page.evaluate(
    ({ inputs, shots }) =>
      new Promise((res) => {
        const canvas = document.getElementById('game');
        const captured = [];
        let i = 0;
        const tick = () => {
          const s = window.omr.snapshot();
          for (const sh of shots) {
            if (!sh.done && s.screen === 'playing' && s.time >= sh.t) {
              sh.done = true;
              captured.push({ name: sh.name, time: s.time, data: canvas.toDataURL('image/png') });
            }
          }
          while (s.screen === 'playing' && i < inputs.length && inputs[i].t <= s.time + 0.004) {
            const key = inputs[i].dir < 0 ? 'ArrowLeft' : 'ArrowRight';
            window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
            i++;
          }
          if (s.screen === 'finishing' || s.screen === 'results' || s.screen === 'title') res({ fired: i, captured });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { inputs, shots },
  );
  for (const cp of [...checkpoints].sort((a, b) => a.t - b.t)) {
    await waitTime(cp.t);
    await cp.run();
  }
  const { fired, captured } = await done;
  for (const c of captured) {
    writeFileSync(`${OUT}/${c.name}.png`, Buffer.from(c.data.split(',')[1], 'base64'));
    console.log(`    frame ${c.name} at sim ${c.time.toFixed(3)} s`);
  }
  check(fired === inputs.length, `all ${inputs.length} planned key presses delivered (${fired})`);
}

function checkRoute(r, name) {
  const e = route(name).expected;
  check(
    r.score === e.score && r.crashes === e.crashes && r.cores - r.bigCores === e.normalCores && r.bigCores === e.bigCores,
    `${name} route: score ${r.score} (expected ${e.score}), crashes ${r.crashes}, cores ${r.cores - r.bigCores}/18, +500 ${r.bigCores}/3`,
  );
}

await shot('01-title');
let s = await snap();
check(s.screen === 'title' && s.touch === false, 'title screen shown, keyboard prompt');
check(s.audio === 'none', 'no AudioContext before the first gesture');

// ── Player 1, round 1: safe route ────────────────────────────────────
await waitUnlocked();
await page.keyboard.press('Enter');
s = await snap();
check(s.screen === 'countdown' && s.audio === 'running', `ENTER starts the countdown and the audio (${s.audio})`);
check(s.banner === null, 'round 1 countdown: no rematch banner');
await page.waitForTimeout(300);
await shot('02-countdown');
console.log('Player 1, round 1 — safe route');
const r1Banners = [];
await playRound(route('safe').inputs, {
  frames: { '03-close-dodge-10.05': 10.05, '04-miss-plus50ms-18.13': 18.13 },
  checkpoints: [
    { t: 1.0, run: async () => r1Banners.push((await snap()).banner) },
    { t: 15.5, run: async () => r1Banners.push((await snap()).banner) },
    { t: 16.95, run: async () => r1Banners.push((await snap()).banner) },
  ],
});
check(r1Banners[0] === 'COLLECT THE CORES', `round 1 at 1 s: tutorial banner (${r1Banners[0]})`);
check(r1Banners[1] === '+500 · BARRIER BEHIND IT', `round 1 at 15.5 s: short risk banner (${r1Banners[1]})`);
check(r1Banners[2] === null, `risk banner gone before 17.0 s (${r1Banners[2]})`);

// Holding ENTER through FINISH and the results lock must not pick the rematch.
await page.keyboard.down('Enter');
await waitScreen('results', 5000);
const lockStart = Date.now();
for (let i = 0; i < 16; i++) {
  await page.keyboard.down('Enter'); // auto-repeat (repeat: true)
  await page.waitForTimeout(100);
}
await page.keyboard.up('Enter');
s = await snap();
check(s.screen === 'results' && s.round === 1, `held ENTER for ${Date.now() - lockStart} ms: still on results`);
s = await snap();
check(!s.locked && s.screenTime >= 1.2, `results unlocked after ${s.screenTime.toFixed(2)} s (≥ 1.2 s)`);
await shot('05-results-round1');
let r = s.results[0];
checkRoute(r, 'safe');
check(s.buttons.join() === 'rematch,finish' && s.selected === 0, `buttons: ${s.buttons.join(', ')}`);
await page.keyboard.press('ArrowRight');
const selRight = (await snap()).selected;
await page.keyboard.press('ArrowLeft');
check(selRight === 1 && (await snap()).selected === 0, '← → move the focus between the buttons');

// ── Round 2: One more round, risky route ─────────────────────────────
await page.keyboard.press('Enter'); // "One more round" is focused
await waitScreen('countdown', 3000);
s = await snap();
check(s.round === 2 && s.time === 0, 'rematch restarts the same course from 0 (round 2)');
check(s.banner === 'SAME TUNNEL · BEAT 1800', `rematch countdown shows the target (${s.banner})`);
console.log('Player 1, round 2 — risky route');
const r2Banners = [];
await playRound(route('risky').inputs, {
  frames: { '06-round2-at-1.0s': 1.0, '07-big-core-grab-17.96': 17.96, '08-escape-close-18.80': 18.8 },
  checkpoints: [
    { t: 1.0, run: async () => r2Banners.push((await snap()).banner) },
    { t: 9.5, run: async () => r2Banners.push((await snap()).banner) },
    { t: 15.5, run: async () => r2Banners.push((await snap()).banner) },
  ],
});
check(r2Banners[0] === 'SAME TUNNEL · BEAT 1800', `round 2 at 1 s: "${r2Banners[0]}"`);
check(r2Banners[1] === null && r2Banners[2] === null, `round 2: no tutorial banners (${r2Banners.slice(1).join(', ')})`);
await waitScreen('results');
await page.keyboard.press('Enter'); // inside the lock: ignored
s = await snap();
check(s.screen === 'results' && s.locked, `ENTER at ${s.screenTime.toFixed(2)} s into the results does nothing`);
await waitUnlocked();
await shot('09-results-round2');
s = await snap();
r = s.results[1];
checkRoute(r, 'risky');
check(r.coresTotal === s.results[0].coresTotal, 'same course both rounds');
check(s.buttons.join() === 'finish', `only one rematch: buttons now = ${s.buttons.join(', ')}`);

// Right arrow must not reveal a hidden rematch.
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await waitScreen('closing', 3000);
await page.waitForTimeout(300);
await shot('10-closing');
check(true, 'Finish → closing screen');

// ── Next player ──────────────────────────────────────────────────────
await waitUnlocked();
await page.keyboard.press('Enter');
await waitScreen('title', 3000);
s = await snap();
check(s.round === 1 && s.results.length === 0, 'closing → fresh title for the next player');

// ── Player 2: mixed route, pauses on focus loss ──────────────────────
await waitUnlocked();
await page.keyboard.press('Space');
console.log('Player 2, round 1 — mixed route with pauses');
let maxShake = 0;
await playRound(route('mixed').inputs, {
  frames: { '11-crash-plus30ms-10.03': 10.03, '12-late-escape-crash-26.70': 26.7 },
  checkpoints: [
    {
      t: 5.0,
      run: async () => {
        // (1) Focus loss, simulated with a window blur event.
        await blur();
        s = await snap();
        const t0 = s.time;
        check(s.screen === 'paused' && s.pauseReason === 'blur', `blur at ${t0.toFixed(2)} s → paused`);
        await page.waitForTimeout(600);
        await shot('13-paused');
        s = await snap();
        check(s.time === t0, `paused: sim time frozen (${t0.toFixed(3)} → ${s.time.toFixed(3)})`);
        await waitUnlocked();
        await page.keyboard.press('Enter');
        s = await snap();
        check(s.screen === 'countdown' && s.time === t0, 'ENTER → 3-2-1 before resuming, same sim time');
        await page.waitForTimeout(900);
        await shot('14-resume-countdown');
        // (2) Second focus loss during the resume countdown.
        await blur();
        s = await snap();
        check(s.screen === 'paused' && s.pauses === 2 && s.time === t0, 'second blur during the 3-2-1 → paused again, time unchanged');
        await waitUnlocked();
        await page.keyboard.press('Enter');
        await waitScreen('playing', 4000);
        s = await snap();
        check(Math.abs(s.time - t0) < 0.05, `resumed after a full 3-2-1 at ${s.time.toFixed(3)} s`);
      },
    },
    {
      t: 7.0,
      run: async () => {
        // (3) Tab hidden, SIMULATED (headless Chromium never really hides the page).
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        s = await snap();
        const t0 = s.time;
        check(s.screen === 'paused' && s.pauseReason === 'hidden', 'simulated visibilitychange(hidden) → paused');
        await page.evaluate(() => {
          delete document.visibilityState;
        });
        await waitUnlocked();
        await page.keyboard.press('Enter');
        await waitScreen('playing', 4000);
        check(Math.abs((await snap()).time - t0) < 0.05, 'resumed at the same sim time');
      },
    },
    ...[10.02, 10.06, 10.1, 10.15].map((t) => ({ t, run: async () => (maxShake = Math.max(maxShake, (await snap()).shake)) })),
  ],
});
check(maxShake > 0, `crash shakes the camera without reduced motion (${maxShake.toFixed(1)} px)`);
await waitScreen('results');
await waitUnlocked();
await shot('15-results-mixed');
s = await snap();
checkRoute(s.results[0], 'mixed');

// Click "Finish" with the mouse: Finish right after round 1.
const box = await page.locator('#game').boundingBox();
const scale = Math.min(box.width / 960, box.height / 540);
const ox = (box.width - 960 * scale) / 2;
const oy = (box.height - 540 * scale) / 2;
await page.mouse.click(box.x + ox + (480 + 14 + 125) * scale, box.y + oy + (418 + 29) * scale);
await waitScreen('closing', 3000);
check(true, 'mouse click on Finish after round 1 → closing');

// Nobody touches the closing screen: back to the title after 45 s.
console.log('Idle on the closing screen (45 s)');
const idleStart = Date.now();
await page.waitForFunction(() => window.omr.snapshot().idleLeft <= 5, null, { timeout: 50000, polling: 100 });
await shot('16-idle-warning');
await waitScreen('title', 15000);
s = await snap();
const idleSecs = (Date.now() - idleStart) / 1000;
check(s.round === 1 && s.results.length === 0, `idle ${idleSecs.toFixed(1)} s → title, round 1, no results`);
check(idleSecs >= 44 && idleSecs <= 47, 'idle reset after ~45 s');

// ── Player 3: passive (no input) → Escape on results ─────────────────
await waitUnlocked();
await page.keyboard.press('Enter');
console.log('Player 3, round 1 — passive');
await playRound(route('passive').inputs);
await waitScreen('results');
s = await snap();
checkRoute(s.results[0], 'passive');
await page.keyboard.press('Escape');
s = await snap();
check(s.screen === 'title' && s.round === 1 && s.results.length === 0, 'Escape on results → title, round 1, no results');

// ── Player 4: Escape on every in-round screen, live keys, mute ───────
console.log('Player 4 — Escape, live keys, mute');
await waitUnlocked();
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
s = await snap();
check(s.screen === 'title' && s.round === 1, 'Escape during the countdown → title');
await waitUnlocked();
await page.keyboard.press('Enter');
await waitScreen('playing', 5000);
const lane0 = (await snap()).lane;
await page.keyboard.press('ArrowLeft');
const lane1 = (await snap()).lane;
check(lane0 === 1 && lane1 === 0, `ArrowLeft switches lane instantly (${lane0} → ${lane1})`);
await page.keyboard.press('ArrowLeft');
check((await snap()).lane === 0, 'left edge blocks the move');
await page.keyboard.down('ArrowRight'); // holding should move exactly one lane
await page.evaluate(() => {
  for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true }));
});
await page.waitForTimeout(200);
await page.keyboard.up('ArrowRight');
check((await snap()).lane === 1, 'holding → moves exactly one lane');
await page.keyboard.press('m');
s = await snap();
check(s.muted === true, 'M mutes');
await shot('17-muted-icon');
await page.keyboard.press('m');
check((await snap()).muted === false, 'M again unmutes');
await blur();
check((await snap()).screen === 'paused', 'blur → paused');
await page.keyboard.press('Escape');
s = await snap();
check(s.screen === 'title' && s.round === 1, 'Escape while paused → title');
await waitUnlocked();
await page.keyboard.press('Enter');
await waitScreen('playing', 5000);
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
s = await snap();
check(s.screen === 'title' && s.round === 1 && s.results.length === 0, 'Escape while playing → title');

s = await snap();
const needed = ['move', 'bump', 'collect', 'big', 'crash', 'close', 'miss', 'tick', 'go', 'finish', 'menuMove', 'confirm'];
const missing = needed.filter((id) => !s.sounds[id]);
check(missing.length === 0, `every sound was triggered (${needed.map((id) => `${id} ${s.sounds[id] ?? 0}`).join(', ')})`);

// ── Touch phone, landscape, reduced motion (emulated) ────────────────
console.log('Touch phone (emulated 844×390, reduced motion)');
const phone = await openPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
s = await snap(phone);
check(s.touch === true && s.reducedMotion === true, 'touch device: "Tap to play", reduced motion detected');
await phone.waitForTimeout(700);
await shot('18-phone-title', phone);
await phone.touchscreen.tap(422, 195);
await waitScreen('playing', 5000, phone);
await phone.touchscreen.tap(100, 200); // left half
check((await snap(phone)).lane === 0, 'tap on the left half → left lane');
await phone.touchscreen.tap(700, 200); // right half
check((await snap(phone)).lane === 1, 'tap on the right half → back to the centre');
let phoneShake = 0;
await phone.waitForFunction(() => window.omr.snapshot().stats.crashes >= 1, null, { timeout: 15000, polling: 'raf' });
for (let i = 0; i < 6; i++) {
  phoneShake = Math.max(phoneShake, (await snap(phone)).shake);
  await phone.waitForTimeout(30);
}
await shot('19-phone-crash-reduced-motion', phone);
check(phoneShake === 0, `reduced motion: the crash does not move the camera (${phoneShake} px)`);

check(errors.length === 0, `no page errors, no network requests${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll end-to-end checks passed');
process.exit(failures ? 1 : 0);
