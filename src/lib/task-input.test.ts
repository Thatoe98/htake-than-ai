import { describe, expect, it } from "vitest";
import { validateAssignedTask } from "./task-input";

const tz = "Asia/Yangon";

describe("validateAssignedTask", () => {
  it("trims, and a bare date means the end of that local day", () => {
    const r = validateAssignedTask({ title: "  Call the supplier ", deadline: "2026-10-20", notes: " " }, tz);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe("Call the supplier");
    expect(r.value.notes).toBeNull();
    expect(r.value.deadline?.toISOString()).toBe("2026-10-20T17:29:00.000Z"); // 23:59 at UTC+6:30
  });

  it("allows no deadline", () => {
    const r = validateAssignedTask({ title: "x", deadline: "", notes: "" }, tz);
    expect(r.ok && r.value.deadline).toBeNull();
  });

  it.each([
    [{ title: "  " }, /what the task/],
    [{ title: "a".repeat(201) }, /at most 200/],
    [{ deadline: "31/12/2026" }, /not a valid date/],
    [{ deadline: "2026-02-31" }, /not a valid date/],
  ])("rejects %j", (patch, message) => {
    const r = validateAssignedTask({ title: "ok", deadline: "", notes: "", ...patch }, tz);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(message);
  });
});
