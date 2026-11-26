import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bonusBreakdown, clockAt, closingFor, closingPageCount } from '../src/story.ts';
import { play } from './planner.ts';
import { ROUTES } from './routes.ts';

const statsOf = (name: string) => play(ROUTES.find((r) => r.name === name)!.inputs).stats;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

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

test('CLOSING: both routes (Finish after round 1, and one more round) reach the 3 cards', () => {
  const finishNow = closingFor([statsOf('mixed')]);
  const rematch = closingFor([statsOf('safe'), statsOf('risky')]);

  assert.equal(finishNow.finalClock, '10:30 PM');
  assert.equal(finishNow.headline, 'You chose Finish at 10:30 PM, after one round.');
  assert.equal(rematch.finalClock, '11:00 PM');
  assert.equal(rematch.headline, 'You chose one more round at 10:30 PM and finished at 11:00 PM.');
  assert.equal(finishNow.rounds.length, 1);
  assert.equal(rematch.rounds.length, 2);
  assert.match(finishNow.rounds[0], /1900 points · \+500: 1 banked · 1 let pass · 1 lost/);
  assert.match(rematch.rounds[1], /11:00 PM · 3100 points · \+500: 3 banked · 0 let pass · 0 lost/);

  for (const c of [finishNow, rematch]) {
    assert.deepEqual(c.cards.map((k) => k.tag), ['FEEDBACK', 'DECISIONS', 'SLEEP']);
    assert.equal(closingPageCount(c), 5);
    assert.match(c.disclaimer, /game data/);
    assert.match(c.disclaimer, /don’t measure your brain/);
  }
  // The first line of each card describes what this player did.
  assert.equal(finishNow.cards[1].you, 'You banked 1, let 1 pass, lost 1.');
  assert.equal(rematch.cards[0].you, '“Beat 1800?” Round 2: 3100.');
  assert.equal(rematch.cards[1].you, 'Over 2 rounds: 3 banked, 3 let pass, 0 lost.');
  assert.equal(finishNow.cards[2].you, 'You stopped at 10:30 PM.');
  assert.equal(rematch.cards[2].you, 'The clock went from 10:30 PM to 11:00 PM.');
});

test('CARDS: ≤ 40 words each, no measurement claims, only checked sources, adults named, clock fictional', () => {
  const closings = [
    ...ROUTES.map((r) => closingFor([play(r.inputs).stats])),
    ...ROUTES.flatMap((a) => ROUTES.map((b) => closingFor([play(a.inputs).stats, play(b.inputs).stats]))),
  ];
  for (const c of closings) {
    for (const card of c.cards) {
      const text = `${card.you} ${card.body}`;
      assert.ok(words(text) <= 40, `${card.tag}: ${words(text)} words`);
      // The game never claims to measure, test or detect anything in the player.
      assert.doesNotMatch(text, /\b(measur\w*|tests?|tested|detect\w*|diagnos\w*|your (brain|dopamine|prefrontal))\b/i, card.tag);
      // Chaarani et al. (2022) was retracted and replaced: it is left out.
      assert.doesNotMatch(`${text} ${card.source}`, /Chaarani/);
      assert.match(card.source, /^(Koepp et al\., 1998|National Institute of Mental Health, 2023)$/);
    }
    const [feedback, , sleep] = c.cards;
    assert.match(feedback.body, /adult/, 'the dopamine study was done with adults');
    assert.match(feedback.body, /evidence consistent with/, 'Koepp: evidence consistent with release, not proof');
    assert.match(sleep.body, /This clock is fictional\./);
  }
});
