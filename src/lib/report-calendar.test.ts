import { describe, expect, it } from "vitest";
import { isIsoDate, monthBounds, monthGrid, openBlockers, parseMonth, parseRange, reportState, shiftMonth } from "./report-calendar";

describe("parseRange", () => {
  it("drops invalid dates and orders a reversed range", () => {
    expect(parseRange("2026-10-05", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(parseRange("2026-02-31", "nope")).toEqual({ from: undefined, to: undefined });
    expect(parseRange(undefined, "2026-10-01")).toEqual({ from: undefined, to: "2026-10-01" });
  });
  it("rejects impossible dates", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });
});

describe("months", () => {
  it("falls back to the current month", () => {
    expect(parseMonth("2026-13", "2026-10-15")).toBe("2026-10");
    expect(parseMonth("2026-03", "2026-10-15")).toBe("2026-03");
  });
  it("shifts across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("knows month length", () => {
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("monthGrid", () => {
  it("starts on Monday and pads to whole weeks", () => {
    // 1 Oct 2026 is a Thursday
    const weeks = monthGrid("2026-10");
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });
});

describe("blockers", () => {
  it("tracks what is still open", () => {
    expect(openBlockers(["a", "b"], ["a"])).toEqual(["b"]);
    expect(openBlockers(["a"], ["gone"])).toEqual(["a"]);
  });
  it("picks the day state", () => {
    const ack = new Date();
    expect(reportState({ blockers: ["a"], resolvedBlockers: [], acknowledgedAt: ack })).toBe("open_blockers");
    expect(reportState({ blockers: ["a"], resolvedBlockers: ["a"], acknowledgedAt: null })).toBe("new");
    expect(reportState({ blockers: [], resolvedBlockers: [], acknowledgedAt: ack })).toBe("acknowledged");
  });
});
