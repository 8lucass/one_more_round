// Story layer (presentation only): the fictional clock and the closing text.
// No DOM, no randomness: the Node tests check every card in both routes.
//
// Every scientific sentence here comes from the source check in
// docs/auditoria-v0.1.0.md §3.4 (NIMH 2023, Koepp et al. 1998). The game
// itself measures nothing: scores, crashes and the choice to play again are
// game data, and the clock is fictional.

import { BIG_CORE_POINTS, CLOCK_START, CLOCK_STEP } from './config.ts';
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

export const breakdownText = (s: Stats): string => {
  const b = bonusBreakdown(s);
  return `${b.banked} banked · ${b.letPass} let pass · ${b.lost} lost`;
};

export interface Card {
  tag: 'FEEDBACK' | 'DECISIONS' | 'SLEEP';
  title: string;
  /** First line: what this player did, described without judging it. */
  you: string;
  /** The research connection (checked against the sources). */
  body: string;
  source: string;
}

export interface Closing {
  finalClock: string;
  headline: string;
  /** One line per round played. */
  rounds: string[];
  cards: Card[];
  disclaimer: string;
  question: string;
  references: string[];
}

/** Pages of the closing screen: summary, one per card, then the end page. */
export const closingPageCount = (c: Closing): number => c.cards.length + 2;

export function closingFor(results: readonly Stats[]): Closing {
  const n = Math.max(1, results.length);
  const first = results[0];
  const last = results[results.length - 1];
  const finalClock = clockAt(n);

  const headline =
    n === 1
      ? `You chose Finish at ${clockAt(1)}, after one round.`
      : `You chose one more round at ${clockAt(1)} and finished at ${finalClock}.`;
  const rounds = results.map(
    (s, i) => `Round ${i + 1} · ${clockAt(i + 1)} · ${s.score} points · +${BIG_CORE_POINTS}: ${breakdownText(s)}`,
  );

  // Totals over every round played, for the decisions card.
  const sum = { banked: 0, letPass: 0, lost: 0 };
  for (const s of results) {
    const b = bonusBreakdown(s);
    sum.banked += b.banked;
    sum.letPass += b.letPass;
    sum.lost += b.lost;
  }

  const feedbackYou =
    n === 1 || !first || !last
      ? `Your best streak: ${last ? last.bestStreak : 0}.`
      : `“Beat ${first.score}?” Round 2: ${last.score}.`;
  const decisionsYou =
    n === 1
      ? `You banked ${sum.banked}, let ${sum.letPass} pass, lost ${sum.lost}.`
      : `Over ${n} rounds: ${sum.banked} banked, ${sum.letPass} let pass, ${sum.lost} lost.`;
  const sleepYou = n === 1 ? `You stopped at ${finalClock}.` : `The clock went from ${clockAt(1)} to ${finalClock}.`;

  return {
    finalClock,
    headline,
    rounds,
    cards: [
      {
        tag: 'FEEDBACK',
        title: 'Striatum and dopamine',
        you: feedbackYou,
        body:
          'Points, streaks and flashes are feedback. In a brain-imaging study, 8 adult men playing a video game showed evidence consistent with dopamine release in the striatum. Dopamine may be involved in learning and reinforcement.',
        source: 'Koepp et al., 1998',
      },
      {
        tag: 'DECISIONS',
        title: 'Prefrontal cortex',
        you: decisionsYou,
        body:
          'Each +500 was a quick plan. The prefrontal cortex helps with planning, prioritizing and making good decisions, and is one of the last brain parts to mature.',
        source: 'National Institute of Mental Health, 2023',
      },
      {
        tag: 'SLEEP',
        title: 'Melatonin and sleep',
        you: sleepYou,
        body:
          'This clock is fictional. In teens, melatonin, the sleep hormone, stays high later at night. Too little sleep can make it harder to pay attention and control impulses.',
        source: 'National Institute of Mental Health, 2023',
      },
    ],
    disclaimer: 'Your score, your choices and the clock are game data. They don’t measure your brain.',
    question: 'What made you want to keep playing, if anything?',
    references: [
      'Koepp, M. J., et al. (1998). Evidence for striatal dopamine release during a video game. Nature, 393, 266–268.',
      'National Institute of Mental Health. (2023). The teen brain: 7 things to know.',
    ],
  };
}
