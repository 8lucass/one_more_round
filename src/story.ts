// Story layer (presentation only): the fictional clock and the closing text.
// No DOM, no randomness: the Node tests check the text for every route.
//
// The closing has two pages after "Finish":
//   0 "Your run": the score (and the real change between rounds), what
//     happened to each +500, the final fictional time.
//   1 "What this has to do with your brain": three short blocks (Reward,
//     Decisions, Sleep timing), each linking something the player just saw
//     to one brain structure and one sourced idea, then a question.
//
// Every scientific sentence here was checked against its source (see
// docs/explicacion-escrita.md and its notes): Koepp et al. (1998), NIMH (2023),
// NIGMS (2023). The game itself measures nothing: scores, crashes and the
// choice to play again are game data, and the clock is fictional. The full
// reference list is in the printed explanation, not on screen.

import { CLOCK_START, CLOCK_STEP } from './config.ts';
import type { Stats } from './sim.ts';

/** Fictional time at which `round` is played: round 1 → "10:30 PM", round 2 → "11:00 PM". */
export function clockAt(round: number): string {
  const m = (((CLOCK_START + (round - 1) * CLOCK_STEP) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** What happened to the +500 cores of one round. "Let pass" = never grabbed. */
export function bonusBreakdown(s: Stats): { banked: number; letPass: number; lost: number } {
  return { banked: s.bigBanked, letPass: s.bigCoresTotal - s.bigCores, lost: s.bigLost };
}

/** Results screen wording (kept short: the closing explains it in plain words). */
export const breakdownText = (s: Stats): string => {
  const b = bonusBreakdown(s);
  return `${b.banked} banked · ${b.letPass} let pass · ${b.lost} lost`;
};

/** Closing wording for one round's +500s: "1 won · 1 lost · 1 let pass". */
export const bonusCounts = (s: Stats): string => {
  const b = bonusBreakdown(s);
  return `${b.banked} won · ${b.lost} lost · ${b.letPass} let pass`;
};

/** Signed score change between two rounds, with a real minus sign. */
export function scoreChange(before: number, after: number): { text: string; sign: -1 | 0 | 1 } {
  const d = after - before;
  if (d === 0) return { text: 'Same score as round 1', sign: 0 };
  return d > 0 ? { text: `+${d} points`, sign: 1 } : { text: `−${-d} points`, sign: -1 };
}

export interface Block {
  tag: 'REWARD' | 'DECISIONS' | 'SLEEP TIMING';
  /** The brain structure this block is about. */
  structure: string;
  /** Two short sentences: what the player saw in the game, then the sourced idea. */
  text: string;
  /** Discreet author–year citation. */
  cite: string;
}

export interface Closing {
  finalClock: string;
  /** Page 0, "Your run". */
  headline: string;
  /** One round: "1900 points". Rematch: "Round 1: 1800 → Round 2: 3100". */
  score: string;
  /** Rematch only: the change from round 1 to round 2. */
  change: { text: string; sign: -1 | 0 | 1 } | null;
  /** What won / lost / let pass mean, in plain words. */
  bonusRule: string;
  /** One line per round: "Your +500 cores: …" or "Round 1: …". */
  bonusLines: string[];
  /** Page 1, "What this has to do with your brain". */
  brainTitle: string;
  blocks: Block[];
  disclaimer: string;
  question: string;
}

/** The closing always has two pages: "Your run", then the brain page. */
export const CLOSING_PAGES = 2;
export const closingPageCount = (_c: Closing): number => CLOSING_PAGES;

export function closingFor(results: readonly Stats[]): Closing {
  const n = Math.max(1, results.length);
  const first = results[0];
  const last = results[results.length - 1];
  const finalClock = clockAt(n);
  const rematch = n > 1 && !!first && !!last;

  const headline = rematch
    ? `You played one more round and finished at ${finalClock}.`
    : `You chose Finish at ${finalClock}, after one round.`;
  const score = rematch ? `Round 1: ${first.score}  →  Round 2: ${last.score}` : `${last ? last.score : 0} points`;
  const change = rematch ? scoreChange(first.score, last.score) : null;
  const bonusLines = rematch
    ? results.map((s, i) => `Round ${i + 1}: ${bonusCounts(s)}`)
    : [`Your +500 cores: ${last ? bonusCounts(last) : '0 won · 0 lost · 0 let pass'}`];

  // Reward: the feedback this player actually saw (the rematch target only exists after round 1).
  const rewardSeen = rematch
    ? `Sounds, +500s and “Beat ${first.score}?” are instant feedback that can make another round tempting.`
    : 'Sounds, +500s and a score to beat are instant feedback that can make another round tempting.';
  const sleepSeen = rematch
    ? `One more round moved this fictional clock to ${finalClock}: more rounds, later bedtime.`
    : `You stopped at ${finalClock}; every extra round would push this fictional clock, and bedtime, 30 minutes later.`;

  return {
    finalClock,
    headline,
    score,
    change,
    bonusRule: 'A +500 is won if you dodge the barrier right behind it, lost if you crash into that barrier, or let pass if you skip it.',
    bonusLines,
    brainTitle: 'What this has to do with your brain',
    blocks: [
      {
        tag: 'REWARD',
        structure: 'Striatum',
        text: `${rewardSeen} Scans of 8 adult men playing a video game found evidence consistent with dopamine release in the striatum.`,
        cite: 'Koepp et al., 1998',
      },
      {
        tag: 'DECISIONS',
        structure: 'Prefrontal cortex',
        text:
          'Each +500 meant choosing 200 safe points or planning a quick escape from the barrier behind it. That planning relies on the prefrontal cortex, one of the last brain areas to mature.',
        cite: 'NIMH, 2023',
      },
      {
        tag: 'SLEEP TIMING',
        structure: 'Suprachiasmatic nucleus',
        text: `${sleepSeen} The brain’s master clock controls melatonin, which in teens stays high later at night.`,
        cite: 'NIGMS, 2023; NIMH, 2023',
      },
    ],
    disclaimer: 'Your score and your choices are game data. They don’t measure your brain.',
    question: 'What made you want to keep playing, if anything?',
  };
}
