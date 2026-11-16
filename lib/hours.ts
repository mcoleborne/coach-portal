import { sydneyMonthKey } from "./time/sydney";

/**
 * Hours this month. Derived from data every time, never stored.
 * Sessions used: sessions held, plus sessions the owner cancelled inside
 * 24 hours. Reviews used: answered cards, a large card counting as two.
 * Allowance: the tier set in tier_by_month for the current Sydney month.
 */

export type TierId = "owners_coach" | "launch_intensive" | "sounding_board";

export type Tier = {
  id: TierId;
  name: string;
  sessions: number;
  reviews: number;
  midWeekCheckIns: boolean;
};

export const TIERS: Record<TierId, Tier> = {
  owners_coach: { id: "owners_coach", name: "Owner's Coach", sessions: 4, reviews: 8, midWeekCheckIns: false },
  launch_intensive: {
    id: "launch_intensive",
    name: "Launch Intensive",
    sessions: 4,
    reviews: 11,
    midWeekCheckIns: true,
  },
  sounding_board: { id: "sounding_board", name: "Sounding Board", sessions: 4, reviews: 4, midWeekCheckIns: false },
};

export type SessionForHours = {
  starts_at: string;
  status: "scheduled" | "held" | "cancelled_by_owner_late" | "cancelled" | "reschedule_requested";
};

export type CardForHours = {
  size: "standard" | "large";
  status: "awaiting_coach" | "question_back" | "answered" | "actioned";
  answered_at: string | null;
};

export type HoursMeter = {
  monthKey: string;
  tier: Tier | null;
  sessionsUsed: number;
  sessionsAllowed: number | null;
  reviewsUsed: number;
  reviewsAllowed: number | null;
};

const LATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * An owner cancellation counts as used when notice was under 24 hours.
 * Compared on instants, so the rule holds across a DST change.
 */
export function classifyOwnerCancellation(
  startsAt: Date,
  cancelledAt: Date,
): "cancelled_by_owner_late" | "cancelled" {
  return startsAt.getTime() - cancelledAt.getTime() < LATE_WINDOW_MS ? "cancelled_by_owner_late" : "cancelled";
}

export function tierForMonth(tierByMonth: Record<string, string> | null | undefined, monthKey: string): Tier | null {
  const id = tierByMonth?.[monthKey];
  return id && id in TIERS ? TIERS[id as TierId] : null;
}

export function computeHours(input: {
  now: Date;
  tierByMonth: Record<string, string> | null | undefined;
  sessions: SessionForHours[];
  cards: CardForHours[];
}): HoursMeter {
  const monthKey = sydneyMonthKey(input.now);
  const tier = tierForMonth(input.tierByMonth, monthKey);

  const sessionsUsed = input.sessions.filter(
    (s) =>
      (s.status === "held" || s.status === "cancelled_by_owner_late") &&
      sydneyMonthKey(new Date(s.starts_at)) === monthKey,
  ).length;

  const reviewsUsed = input.cards
    .filter(
      (c) =>
        (c.status === "answered" || c.status === "actioned") &&
        c.answered_at !== null &&
        sydneyMonthKey(new Date(c.answered_at)) === monthKey,
    )
    .reduce((sum, c) => sum + (c.size === "large" ? 2 : 1), 0);

  return {
    monthKey,
    tier,
    sessionsUsed,
    sessionsAllowed: tier?.sessions ?? null,
    reviewsUsed,
    reviewsAllowed: tier?.reviews ?? null,
  };
}
