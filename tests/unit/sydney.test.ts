import { describe, expect, it } from "vitest";
import {
  civilDaysBetween,
  formatSydneyDateTime,
  parseCivil,
  sydneyDateIso,
  sydneyMonthKey,
  sydneyParts,
  sydneyToday,
  zoneLabel,
} from "@/lib/time/sydney";

// Pinned clocks. Each pair sits either side of Sydney midnight, where the UTC
// date and the Sydney date disagree on one side.
describe("sydneyToday across midnight", () => {
  it("AEDT (summer, UTC+11): 23:59 and 00:01", () => {
    const before = new Date("2026-01-15T12:59:00Z"); // 15 Jan 23:59 AEDT
    const after = new Date("2026-01-15T13:01:00Z"); // 16 Jan 00:01 AEDT
    expect(sydneyToday(before)).toEqual({ year: 2026, month: 1, day: 15 });
    expect(sydneyToday(after)).toEqual({ year: 2026, month: 1, day: 16 });
    // The UTC date is still the 15th, which is the defect the helper exists to stop.
    expect(after.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(sydneyDateIso(after)).toBe("2026-01-16");
    expect(zoneLabel(before)).toBe("AEDT");
  });

  it("AEST (winter, UTC+10): 23:59 and 00:01", () => {
    const before = new Date("2026-07-15T13:59:00Z"); // 15 Jul 23:59 AEST
    const after = new Date("2026-07-15T14:01:00Z"); // 16 Jul 00:01 AEST
    expect(sydneyDateIso(before)).toBe("2026-07-15");
    expect(sydneyDateIso(after)).toBe("2026-07-16");
    expect(zoneLabel(after)).toBe("AEST");
  });

  it("a fixed +10 offset would be wrong in AEDT: 13:30Z is already tomorrow", () => {
    const t = new Date("2026-01-15T13:30:00Z"); // 16 Jan 00:30 AEDT, but 23:30 at +10
    expect(sydneyDateIso(t)).toBe("2026-01-16");
  });

  it("month rollover at Sydney midnight, not UTC midnight", () => {
    const t = new Date("2026-11-30T13:30:00Z"); // 1 Dec 00:30 AEDT
    expect(sydneyMonthKey(t)).toBe("2026-12");
    expect(sydneyMonthKey(new Date("2026-11-30T12:30:00Z"))).toBe("2026-11");
    const w = new Date("2026-06-30T14:30:00Z"); // 1 Jul 00:30 AEST
    expect(sydneyMonthKey(w)).toBe("2026-07");
  });
});

describe("DST changes", () => {
  it("AEDT ends on the first Sunday in April 2026 (5 Apr, 3am becomes 2am)", () => {
    const lastAedt = sydneyParts(new Date("2026-04-04T15:59:00Z"));
    const firstAest = sydneyParts(new Date("2026-04-04T16:00:00Z"));
    expect(lastAedt).toMatchObject({ day: 5, hour: 2, minute: 59, zone: "AEDT" });
    expect(firstAest).toMatchObject({ day: 5, hour: 2, minute: 0, zone: "AEST" });
  });

  it("AEDT starts on the first Sunday in October 2026 (4 Oct, 2am becomes 3am)", () => {
    const lastAest = sydneyParts(new Date("2026-10-03T15:59:00Z"));
    const firstAedt = sydneyParts(new Date("2026-10-03T16:00:00Z"));
    expect(lastAest).toMatchObject({ day: 4, hour: 1, minute: 59, zone: "AEST" });
    expect(firstAedt).toMatchObject({ day: 4, hour: 3, minute: 0, zone: "AEDT" });
  });

  it("midnight either side of the April change", () => {
    expect(sydneyDateIso(new Date("2026-04-04T12:59:00Z"))).toBe("2026-04-04"); // 23:59 AEDT
    expect(sydneyDateIso(new Date("2026-04-04T13:01:00Z"))).toBe("2026-04-05"); // 00:01 AEDT
    expect(sydneyDateIso(new Date("2026-04-05T13:59:00Z"))).toBe("2026-04-05"); // 23:59 AEST
    expect(sydneyDateIso(new Date("2026-04-05T14:01:00Z"))).toBe("2026-04-06"); // 00:01 AEST
  });

  it("midnight either side of the October change", () => {
    expect(sydneyDateIso(new Date("2026-10-03T13:59:00Z"))).toBe("2026-10-03"); // 23:59 AEST
    expect(sydneyDateIso(new Date("2026-10-03T14:01:00Z"))).toBe("2026-10-04"); // 00:01 AEST
    expect(sydneyDateIso(new Date("2026-10-04T12:59:00Z"))).toBe("2026-10-04"); // 23:59 AEDT
    expect(sydneyDateIso(new Date("2026-10-04T13:01:00Z"))).toBe("2026-10-05"); // 00:01 AEDT
  });
});

describe("civil day arithmetic", () => {
  it("counts days with no zone involved, across DST and year ends", () => {
    expect(civilDaysBetween(parseCivil("2026-04-04"), parseCivil("2026-04-06"))).toBe(2);
    expect(civilDaysBetween(parseCivil("2026-10-03"), parseCivil("2026-10-05"))).toBe(2);
    expect(civilDaysBetween(parseCivil("2026-12-31"), parseCivil("2027-01-01"))).toBe(1);
    expect(civilDaysBetween(parseCivil("2028-02-28"), parseCivil("2028-03-01"))).toBe(2);
    expect(civilDaysBetween(parseCivil("2026-03-01"), parseCivil("2026-02-28"))).toBe(-1);
  });
});

describe("labels", () => {
  it("formats with AEDT or AEST as it applies on the date", () => {
    expect(formatSydneyDateTime(new Date("2026-11-18T07:00:00Z"))).toBe("Wed 18 Nov, 6:00pm AEDT");
    expect(formatSydneyDateTime(new Date("2026-06-17T08:00:00Z"))).toBe("Wed 17 Jun, 6:00pm AEST");
    expect(formatSydneyDateTime(new Date("2026-06-17T14:05:00Z"))).toBe("Thu 18 Jun, 12:05am AEST");
  });
});
