import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bonusBreakdown, clockAt, CLOSING_PAGES, closingFor, scoreChange } from '../src/story.ts';
import { play } from './planner.ts';
import { ROUTES } from './routes.ts';

const statsOf = (name: string) => play(ROUTES.find((r) => r.name === name)!.inputs).stats;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/(?<=[.?!])\s+(?=[A-Z“"])/).filter(Boolean).length;

test('CLOCK: 10:30 PM in round 1, 11:00 PM only after choosing the rematch', () => {
  assert.equal(clockAt(1), '10:30 PM');
  assert.equal(clockAt(2), '11:00 PM');
});

test('+500 BREAKDOWN matches the simulation: banked + let pass + lost = 3 in every route', () => {
  for (const r of ROUTES) {
    const s = play(r.inputs).stats;
    const b = bonusBreakdown(s);
    assert.equal(b.banked + b.letPass + b.lost, s.bigCoresTotal, r.name);
    assert.equal(b.banked, r.expected.bigBanked, `${r.name} banked`);
    assert.equal(b.lost, r.expected.bigLost, `${r.name} lost`);
    assert.equal(b.letPass, s.bigCoresTotal - r.expected.bigCores, `${r.name} let pass`);
  }
});

test('SCORE CHANGE: real sign (better, worse, tie)', () => {
  assert.deepEqual(scoreChange(1800, 3100), { text: '+1300 points', sign: 1 });
  assert.deepEqual(scoreChange(3100, 1800), { text: '−1300 points', sign: -1 });
  assert.deepEqual(scoreChange(1900, 1900), { text: 'Same score as round 1', sign: 0 });
});

test('YOUR RUN, one round (Finish at 10:30 PM): score, +500 counts with zero cases, no change line', () => {
  const mixed = closingFor([statsOf('mixed')]);
  assert.equal(mixed.finalClock, '10:30 PM');
  assert.equal(mixed.headline, 'You chose Finish at 10:30 PM, after one round.');
  assert.equal(mixed.score, '1900 points');
  assert.equal(mixed.change, null);
  assert.deepEqual(mixed.bonusLines, ['Your +500 cores: 1 won · 1 lost · 1 let pass']);
  // Zero +500 won: the line says so with a 0, it does not hide it.
  assert.deepEqual(closingFor([statsOf('safe')]).bonusLines, ['Your +500 cores: 0 won · 0 lost · 3 let pass']);
  assert.deepEqual(closingFor([statsOf('passive')]).bonusLines, ['Your +500 cores: 0 won · 1 lost · 2 let pass']);
  // The rule names all three outcomes in plain words.
  assert.match(mixed.bonusRule, /won if you dodge the barrier/);
  assert.match(mixed.bonusRule, /lost if you crash into that barrier/);
  assert.match(mixed.bonusRule, /let pass if you skip it/);
});

test('YOUR RUN, rematch (11:00 PM): better, worse and tie, each +500 line names its round', () => {
  const better = closingFor([statsOf('safe'), statsOf('risky')]);
  assert.equal(better.finalClock, '11:00 PM');
  assert.equal(better.headline, 'You played one more round and finished at 11:00 PM.');
  assert.equal(better.score, 'Round 1: 1800  →  Round 2: 3100');
  assert.equal(better.change?.text, '+1300 points');
  assert.deepEqual(better.bonusLines, ['Round 1: 0 won · 0 lost · 3 let pass', 'Round 2: 3 won · 0 lost · 0 let pass']);

  const worse = closingFor([statsOf('risky'), statsOf('passive')]);
  assert.equal(worse.change?.text, '−2300 points');
  assert.equal(worse.change?.sign, -1);

  const tie = closingFor([statsOf('mixed'), statsOf('mixed')]);
  assert.equal(tie.change?.text, 'Same score as round 1');
  assert.equal(tie.change?.sign, 0);

  const zeroWon = closingFor([statsOf('passive'), statsOf('safe')]);
  assert.deepEqual(zeroWon.bonusLines, ['Round 1: 0 won · 1 lost · 2 let pass', 'Round 2: 0 won · 0 lost · 3 let pass']);
  assert.equal(zeroWon.change?.text, '+1000 points');
});

test('BRAIN PAGE: Reward / Decisions / Sleep timing, 2 short sentences + 1 citation each, sourced, no measurement claims', () => {
  const closings = [
    ...ROUTES.map((r) => closingFor([play(r.inputs).stats])),
    ...ROUTES.flatMap((a) => ROUTES.map((b) => closingFor([play(a.inputs).stats, play(b.inputs).stats]))),
  ];
  assert.equal(CLOSING_PAGES, 2);
  for (const c of closings) {
    assert.equal(c.brainTitle, 'What this has to do with your brain');
    assert.deepEqual(c.blocks.map((b) => b.tag), ['REWARD', 'DECISIONS', 'SLEEP TIMING']);
    assert.deepEqual(c.blocks.map((b) => b.structure), ['Striatum', 'Prefrontal cortex', 'Suprachiasmatic nucleus']);
    let total = words(c.brainTitle) + words(c.question);
    for (const b of c.blocks) {
      assert.equal(sentences(b.text), 2, `${b.tag}: two sentences — "${b.text}"`);
      assert.ok(words(b.text) <= 34, `${b.tag}: ${words(b.text)} words`);
      total += words(b.text);
      // The game never claims to measure, test or detect anything in the player.
      assert.doesNotMatch(b.text, /\b(measur\w*|tests?|tested|detect\w*|diagnos\w*|your (brain|dopamine|prefrontal|self-control))\b/i, b.tag);
      assert.doesNotMatch(`${b.text} ${b.cite}`, /Chaarani/);
      assert.match(b.cite, /^(Koepp et al\., 1998|NIMH, 2023|NIGMS, 2023; NIMH, 2023)$/);
    }
    assert.ok(total <= 115, `brain page: ${total} words`);
    const [reward, decisions, sleep] = c.blocks;
    assert.match(reward.text, /8 adult men/, 'the dopamine study was done with adult men');
    assert.match(reward.text, /evidence consistent with/, 'Koepp: evidence consistent with release, not proof');
    assert.match(decisions.text, /200 safe points/);
    assert.match(decisions.text, /barrier behind it/);
    assert.match(sleep.text, /fictional clock/);
    assert.match(c.disclaimer, /game data/);
    assert.equal(c.question, 'What made you want to keep playing, if anything?');
  }
  // What the player saw: the rematch target only after a rematch; the clock time matches the route.
  const rematch = closingFor([statsOf('safe'), statsOf('risky')]);
  assert.match(rematch.blocks[0].text, /“Beat 1800\?”/);
  assert.match(rematch.blocks[2].text, /to 11:00 PM/);
  const finish = closingFor([statsOf('mixed')]);
  assert.doesNotMatch(finish.blocks[0].text, /Beat/);
  assert.match(finish.blocks[2].text, /You stopped at 10:30 PM/);
});
