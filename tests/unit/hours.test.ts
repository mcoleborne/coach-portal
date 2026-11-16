import { describe, expect, it } from "vitest";
import { classifyOwnerCancellation, computeHours, type CardForHours, type SessionForHours } from "@/lib/hours";

const NOV = { "2026-11": "owners_coach", "2026-12": "launch_intensive", "2026-07": "sounding_board" };

function card(size: "standard" | "large", answered_at: string | null, status: CardForHours["status"] = "answered") {
  return { size, status, answered_at } satisfies CardForHours;
}
function session(starts_at: string, status: SessionForHours["status"]): SessionForHours {
  return { starts_at, status };
}

describe("hours meter by tier (AEDT month)", () => {
  const now = new Date("2026-11-20T01:00:00Z"); // 20 Nov 12:00pm AEDT

  it("Owner's Coach allows 4 sessions and 8 reviews, large counts as two", () => {
    const h = computeHours({
      now,
      tierByMonth: NOV,
      sessions: [
        session("2026-11-04T07:00:00Z", "held"),
        session("2026-11-11T07:00:00Z", "cancelled_by_owner_late"),
        session("2026-11-18T07:00:00Z", "cancelled"),
        session("2026-11-25T07:00:00Z", "scheduled"),
      ],
      cards: [
        card("standard", "2026-11-10T00:00:00Z"),
        card("large", "2026-11-12T00:00:00Z", "actioned"),
        card("standard", null, "awaiting_coach"),
        card("large", null, "question_back"),
      ],
    });
    expect(h.tier?.name).toBe("Owner's Coach");
    expect(h.sessionsUsed).toBe(2);
    expect(h.sessionsAllowed).toBe(4);
    expect(h.reviewsUsed).toBe(3);
    expect(h.reviewsAllowed).toBe(8);
  });

  it("Launch Intensive in December allows 11 reviews and mid-week check-ins", () => {
    const h = computeHours({
      now: new Date("2026-12-10T01:00:00Z"),
      tierByMonth: NOV,
      sessions: [],
      cards: [card("large", "2026-12-02T00:00:00Z"), card("large", "2026-12-03T00:00:00Z")],
    });
    expect(h.tier?.name).toBe("Launch Intensive");
    expect(h.tier?.midWeekCheckIns).toBe(true);
    expect(h.reviewsAllowed).toBe(11);
    expect(h.reviewsUsed).toBe(4);
  });

  it("an answer at 00:30 AEDT on 1 Dec belongs to December, not November", () => {
    const cards = [card("standard", "2026-11-30T13:30:00Z")];
    const nov = computeHours({ now: new Date("2026-11-30T12:00:00Z"), tierByMonth: NOV, sessions: [], cards });
    const dec = computeHours({ now: new Date("2026-12-05T00:00:00Z"), tierByMonth: NOV, sessions: [], cards });
    expect(nov.monthKey).toBe("2026-11");
    expect(nov.reviewsUsed).toBe(0);
    expect(dec.reviewsUsed).toBe(1);
  });

  it("no tier set for the month shows no allowance", () => {
    const h = computeHours({ now: new Date("2027-03-01T00:00:00Z"), tierByMonth: NOV, sessions: [], cards: [] });
    expect(h.tier).toBeNull();
    expect(h.reviewsAllowed).toBeNull();
  });
});

describe("hours meter by tier (AEST month)", () => {
  it("Sounding Board in July allows 4 and 4, with a session at 00:30 AEST on 1 Jul counted in July", () => {
    const h = computeHours({
      now: new Date("2026-07-15T02:00:00Z"),
      tierByMonth: NOV,
      sessions: [
        session("2026-06-30T14:30:00Z", "held"), // 1 Jul 00:30 AEST
        session("2026-06-30T13:30:00Z", "held"), // 30 Jun 23:30 AEST
      ],
      cards: [card("large", "2026-07-01T00:00:00Z"), card("standard", "2026-07-02T00:00:00Z")],
    });
    expect(h.tier?.name).toBe("Sounding Board");
    expect(h.sessionsUsed).toBe(1);
    expect(h.reviewsUsed).toBe(3);
    expect(h.reviewsAllowed).toBe(4);
  });
});

describe("late cancellation rule", () => {
  const starts = new Date("2026-11-18T07:00:00Z");
  it("exactly 24 hours' notice is not late", () => {
    expect(classifyOwnerCancellation(starts, new Date("2026-11-17T07:00:00Z"))).toBe("cancelled");
  });
  it("one minute under 24 hours is late and counts as used", () => {
    expect(classifyOwnerCancellation(starts, new Date("2026-11-17T07:01:00Z"))).toBe("cancelled_by_owner_late");
  });
  it("uses elapsed time across the April DST change", () => {
    // Session 5 Apr 2026 10:00am AEST (00:00Z). Cancelled 4 Apr 10:30am AEDT (3 Apr 23:30Z).
    // The wall clocks read 23.5 hours apart, but 24.5 real hours elapse.
    expect(classifyOwnerCancellation(new Date("2026-04-05T00:00:00Z"), new Date("2026-04-03T23:30:00Z"))).toBe(
      "cancelled",
    );
  });
  it("uses elapsed time across the October DST change", () => {
    // Session 4 Oct 2026 10:00am AEDT (3 Oct 23:00Z). Cancelled 3 Oct 9:30am AEST (2 Oct 23:30Z).
    // The wall clocks read 24.5 hours apart, but only 23.5 real hours elapse.
    expect(classifyOwnerCancellation(new Date("2026-10-03T23:00:00Z"), new Date("2026-10-02T23:30:00Z"))).toBe(
      "cancelled_by_owner_late",
    );
  });
});
