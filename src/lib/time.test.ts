import { describe, expect, it } from "vitest";
import { localDate, parseLocalDeadline } from "./time";

describe("localDate", () => {
  it("uses the company timezone, not UTC", () => {
    // 18:00 UTC is 00:30 the next day in Yangon (UTC+6:30)
    expect(localDate(new Date("2026-10-12T18:00:00Z"), "Asia/Yangon")).toBe("2026-10-13");
    expect(localDate(new Date("2026-10-12T17:29:00Z"), "Asia/Yangon")).toBe("2026-10-12");
  });
});

describe("parseLocalDeadline", () => {
  it("reads date and time as Yangon local time", () => {
    expect(parseLocalDeadline("2026-10-14T09:00", "Asia/Yangon")?.toISOString()).toBe("2026-10-14T02:30:00.000Z");
  });

  it("treats a bare date as the end of that day", () => {
    expect(parseLocalDeadline("2026-10-14", "Asia/Yangon")?.toISOString()).toBe("2026-10-14T17:29:00.000Z");
  });

  it("handles a zone with daylight saving", () => {
    // New York is UTC-4 in October (EDT) and UTC-5 in December (EST)
    expect(parseLocalDeadline("2026-10-14T09:00", "America/New_York")?.toISOString()).toBe("2026-10-14T13:00:00.000Z");
    expect(parseLocalDeadline("2026-12-14T09:00", "America/New_York")?.toISOString()).toBe("2026-12-14T14:00:00.000Z");
  });

  it("rejects things that are not dates", () => {
    expect(parseLocalDeadline("tomorrow")).toBeNull();
    expect(parseLocalDeadline("2026-13-01")).toBeNull();
    expect(parseLocalDeadline("2026-02-31")).toBeNull();
    expect(parseLocalDeadline("2026-10-14T25:00")).toBeNull();
  });
});
