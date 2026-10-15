import { describe, expect, it } from "vitest";
import { formatDateTime, formatUsd, percentOfCap } from "./format";

describe("formatDateTime", () => {
  it("shows the company-local time (Yangon is UTC+6:30)", () => {
    expect(formatDateTime(new Date("2026-10-13T00:00:00Z"), "Asia/Yangon")).toBe("13 Oct 2026, 06:30");
  });
  it("rolls over to the next local day", () => {
    expect(formatDateTime(new Date("2026-10-13T18:00:00Z"), "Asia/Yangon")).toContain("14 Oct 2026");
  });
});

describe("formatUsd", () => {
  it("uses two decimals for whole-dollar amounts and four for fractions", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(formatUsd(0.00123)).toBe("$0.0012");
  });
});

describe("percentOfCap", () => {
  it("rounds and clamps", () => {
    expect(percentOfCap(5, 20)).toBe(25);
    expect(percentOfCap(30, 20)).toBe(100);
    expect(percentOfCap(-1, 20)).toBe(0);
  });
  it("treats a missing cap as full", () => {
    expect(percentOfCap(1, 0)).toBe(100);
  });
});
