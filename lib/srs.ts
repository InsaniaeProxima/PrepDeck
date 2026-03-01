import type { SRSCard } from "@/lib/types";

/** SRS quality ratings */
export type SRSRating = 0 | 3 | 5;
//  0 = Hard (total reset)
//  3 = Good (standard progression)
//  5 = Easy (accelerated progression)

/** Returns today's date as YYYY-MM-DD in local timezone */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add `days` to today and return YYYY-MM-DD */
function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Default card for a question that has never been reviewed */
function defaultCard(): SRSCard {
  return {
    interval: 0,
    easeFactor: 2.5,
    dueDate: todayISO(),
    repetitions: 0,
  };
}

/**
 * SM-2 algorithm: given the current card state and a user rating,
 * return the updated card with new interval, easeFactor, dueDate, repetitions.
 *
 * @param card - Current SRS state, or undefined for a never-reviewed question
 * @param rating - 0 (Hard), 3 (Good), or 5 (Easy)
 * @returns Updated SRSCard
 */
export function applyRating(card: SRSCard | undefined, rating: SRSRating): SRSCard {
  const c = card ?? defaultCard();

  let { interval, easeFactor, repetitions } = c;

  if (rating < 3) {
    // Hard -- reset to beginning
    interval = 1;
    repetitions = 0;
    // Note: easeFactor IS penalized even on Hard (see formula below).
    // This deviates from strict SM-2 (which leaves EF unchanged on failure),
    // but it is intentional: repeated Hard ratings should lower EF so the
    // interval grows more slowly once the user starts getting it right.
  } else {
    // Good or Easy
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  }

  // Update ease factor (applies for all ratings)
  easeFactor = easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));
  easeFactor = Math.max(1.3, easeFactor);

  const dueDate = addDays(interval);

  return { interval, easeFactor, dueDate, repetitions };
}
