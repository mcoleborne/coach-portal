import { civilToIso, sydneyParts, sydneyToday } from "./time/sydney";

/**
 * The digest rule. At most one email a day per engagement, sent from 7:30am
 * Sydney time, and only when cards were published since the last digest.
 *
 * The scheduler calls at 20:30 and 21:30 UTC, which is 7:30am Sydney in AEDT
 * and in AEST respectively. The window below accepts either call, and the
 * digest_log row for the Sydney date stops the second one sending.
 */

export const DIGEST_WINDOW = { startHour: 7, startMinute: 30, endHour: 9 };

export type DigestDecision =
  | { send: true; sentOn: string }
  | { send: false; reason: "outside_window" | "already_sent_today" | "nothing_new"; sentOn: string };

export function inDigestWindow(now: Date): boolean {
  const p = sydneyParts(now);
  const minutes = p.hour * 60 + p.minute;
  return (
    minutes >= DIGEST_WINDOW.startHour * 60 + DIGEST_WINDOW.startMinute && minutes < DIGEST_WINDOW.endHour * 60
  );
}

export function decideDigest(input: {
  now: Date;
  lastSentOn: string | null; // YYYY-MM-DD, Sydney date of the last digest
  publishedSinceLastDigest: number;
  ignoreWindow?: boolean;
}): DigestDecision {
  const sentOn = civilToIso(sydneyToday(input.now));
  if (!input.ignoreWindow && !inDigestWindow(input.now)) return { send: false, reason: "outside_window", sentOn };
  if (input.lastSentOn === sentOn) return { send: false, reason: "already_sent_today", sentOn };
  if (input.publishedSinceLastDigest <= 0) return { send: false, reason: "nothing_new", sentOn };
  return { send: true, sentOn };
}
