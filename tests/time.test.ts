import { describe, expect, it } from "vitest";
import { localDateTimeRangeToInstants, localDateTimeToInstant, sleepAttributedDate, splitIntervalByLocalDate } from "@/lib/game/time";

describe("timezone-safe timestamps", () => {
  it("attributes an overnight sleep to its wake date and a nap to its start date", () => {
    const night = { categoryKey: "sleep", startedAt: "2026-09-22T14:00:00.000Z", endedAt: "2026-09-22T22:00:00.000Z", details: { sleepType: "night" }, attributedDate: "2026-09-22" };
    const nap = { ...night, startedAt: "2026-09-23T03:00:00.000Z", endedAt: "2026-09-23T04:00:00.000Z", details: { sleepType: "nap" }, attributedDate: "2026-09-23" };
    expect(sleepAttributedDate(night, "Asia/Seoul")).toBe("2026-09-23");
    expect(sleepAttributedDate(nap, "Asia/Seoul")).toBe("2026-09-23");
  });

  it("splits a 23:00–01:30 activity into 60 and 90 minutes", () => {
    const { start, end } = localDateTimeRangeToInstants("2026-09-22", "23:00", "01:30", "Asia/Seoul");
    expect(splitIntervalByLocalDate(start, end, "Asia/Seoul")).toEqual({ "2026-09-22": 60, "2026-09-23": 90 });
  });

  it("uses real elapsed time across the New York spring DST jump", () => {
    const start = localDateTimeToInstant("2026-03-08", "01:30", "America/New_York");
    const end = localDateTimeToInstant("2026-03-08", "03:30", "America/New_York");
    expect((end.getTime() - start.getTime()) / 60_000).toBe(60);
    expect(splitIntervalByLocalDate(start, end, "America/New_York")).toEqual({ "2026-03-08": 60 });
  });

  it("resolves the earlier instant for the repeated fall-back wall time", () => {
    const first0130 = localDateTimeToInstant("2026-11-01", "01:30", "America/New_York");
    const twoThirty = localDateTimeToInstant("2026-11-01", "02:30", "America/New_York");
    expect(first0130.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect((twoThirty.getTime() - first0130.getTime()) / 60_000).toBe(120);
  });
});
