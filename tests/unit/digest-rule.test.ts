import { describe, expect, it } from "vitest";
import { decideDigest, inDigestWindow } from "@/lib/digest-rule";

describe("digest window at 7:30am Sydney", () => {
  it("AEDT: the 20:30 UTC call is 7:30am", () => {
    expect(inDigestWindow(new Date("2026-11-16T20:29:00Z"))).toBe(false);
    expect(inDigestWindow(new Date("2026-11-16T20:30:00Z"))).toBe(true);
  });
  it("AEST: the 21:30 UTC call is 7:30am, the 20:30 call is 6:30am", () => {
    expect(inDigestWindow(new Date("2026-07-16T20:30:00Z"))).toBe(false);
    expect(inDigestWindow(new Date("2026-07-16T21:30:00Z"))).toBe(true);
  });
  it("closes at 9am", () => {
    expect(inDigestWindow(new Date("2026-11-16T22:00:00Z"))).toBe(false);
  });
});

describe("at most one digest a day", () => {
  const morning = new Date("2026-11-16T20:30:00Z"); // 17 Nov 7:30am AEDT

  it("sends when cards are new and none went today", () => {
    expect(decideDigest({ now: morning, lastSentOn: "2026-11-16", publishedSinceLastDigest: 2 })).toEqual({
      send: true,
      sentOn: "2026-11-17",
    });
  });
  it("does not send twice on the same Sydney date, even an hour later", () => {
    const later = new Date("2026-11-16T21:30:00Z"); // 8:30am AEDT, the second scheduled call
    expect(decideDigest({ now: later, lastSentOn: "2026-11-17", publishedSinceLastDigest: 3 })).toMatchObject({
      send: false,
      reason: "already_sent_today",
    });
  });
  it("does not send when nothing was published since the last digest", () => {
    expect(decideDigest({ now: morning, lastSentOn: null, publishedSinceLastDigest: 0 })).toMatchObject({
      send: false,
      reason: "nothing_new",
    });
  });
  it("sentOn is the Sydney date, which differs from the UTC date at 7:30am", () => {
    expect(morning.toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(decideDigest({ now: morning, lastSentOn: null, publishedSinceLastDigest: 1 }).sentOn).toBe("2026-11-17");
  });
  it("AEST: a digest yesterday does not block today", () => {
    const winter = new Date("2026-07-16T21:30:00Z"); // 17 Jul 7:30am AEST
    expect(decideDigest({ now: winter, lastSentOn: "2026-07-16", publishedSinceLastDigest: 1 })).toEqual({
      send: true,
      sentOn: "2026-07-17",
    });
  });
});
