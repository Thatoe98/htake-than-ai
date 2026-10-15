import { describe, expect, it } from "vitest";
import { validateSettings } from "./settings-validate";

describe("validateSettings", () => {
  it("accepts a normal cap and timezone", () => {
    expect(validateSettings({ capUsd: "25", timezone: "Asia/Yangon" })).toEqual({
      ok: true,
      value: { capUsd: 25, timezone: "Asia/Yangon" },
    });
  });
  it("rounds the cap to cents and trims the timezone", () => {
    const r = validateSettings({ capUsd: "12.345", timezone: " UTC " });
    expect(r.ok && r.value).toEqual({ capUsd: 12.35, timezone: "UTC" });
  });
  it.each(["", "abc", "0", "-5", "Infinity", "10001"])("rejects the cap %j", (capUsd) => {
    expect(validateSettings({ capUsd, timezone: "UTC" }).ok).toBe(false);
  });
  it("rejects an unknown timezone", () => {
    const r = validateSettings({ capUsd: "10", timezone: "Mars/Olympus" });
    expect(r.ok).toBe(false);
  });
});
