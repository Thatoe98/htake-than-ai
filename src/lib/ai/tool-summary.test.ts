import { describe, expect, it } from "vitest";
import { LOCALES, t } from "../i18n";
import { isWriteTool, summarizeToolCall, WRITE_TOOLS } from "./tool-summary";

describe("summarizeToolCall (what the employee confirms, E-5)", () => {
  it("shows a work-log item in English", () => {
    const s = summarizeToolCall(
      "log_work",
      { text: "Price list", forWhom: "Mandalay client", status: "done", minutesSpent: 45 },
      "en",
    );
    expect(s?.title).toBe("Log work");
    expect(s?.rows).toEqual([
      { label: "What", value: "Price list" },
      { label: "For", value: "Mandalay client" },
      { label: "Status", value: "Done" },
      { label: "Time spent", value: "45 min" },
    ]);
  });

  it("omits empty optional fields and works in Burmese", () => {
    const s = summarizeToolCall("create_task", { title: "Call supplier", deadline: null, notes: null }, "my");
    expect(s).toEqual({ title: t("my", "tool_create_task"), rows: [{ label: t("my", "f_title"), value: "Call supplier" }] });
  });

  it("puts the person a task goes to first on the assign card", () => {
    const s = summarizeToolCall(
      "assign_task",
      {
        assigneeId: "977974d9-3dae-4d8d-98a4-230767f268e3",
        assigneeName: "Zayar Htun",
        title: "Call me tonight",
        deadline: "2026-10-15T19:00",
        notes: null,
      },
      "en",
    );
    expect(s?.title).toBe("Assign task");
    expect(s?.rows).toEqual([
      { label: "Assign to", value: "Zayar Htun" },
      { label: "Title", value: "Call me tonight" },
      { label: "Deadline", value: "2026-10-15T19:00" },
    ]);
  });

  it("falls back to raw JSON when the assign input has no person", () => {
    expect(summarizeToolCall("assign_task", { title: "x", deadline: null, notes: null }, "en")).toBeNull();
  });

  it("shows all four report parts", () => {
    const s = summarizeToolCall(
      "submit_daily_report",
      { rawText: "x", done: ["A"], inProgress: [], blockers: ["B"], tomorrow: ["C", "D"] },
      "en",
    );
    expect(s?.rows.map((r) => r.value)).toEqual(["• A", "—", "• B", "• C\n• D"]);
  });

  it("returns null for incomplete or unknown input so the UI falls back to raw JSON", () => {
    expect(summarizeToolCall("log_work", { text: "only text" }, "en")).toBeNull();
    expect(summarizeToolCall("nope", {}, "en")).toBeNull();
  });

  it("knows which tools write data", () => {
    expect(WRITE_TOOLS.every(isWriteTool)).toBe(true);
    expect(isWriteTool("search_company_knowledge")).toBe(false);
    expect(isWriteTool("list_my_tasks")).toBe(false);
  });

  it("has a label for every write tool in every language", () => {
    for (const locale of LOCALES) for (const tool of WRITE_TOOLS) expect(t(locale, `tool_${tool}`)).toBeTruthy();
  });
});
