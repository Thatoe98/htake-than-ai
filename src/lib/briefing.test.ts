import { describe, expect, it } from "vitest";
import { attentionRef, buildBriefing, factsForAi, numbersIn, summaryIsFaithful, toSummaryLines, type BriefingInput } from "./briefing";

const staff = [
  { id: "z", name: "Zayar" },
  { id: "a", name: "Aung" },
  { id: "t", name: "Thida" },
];

const input: BriefingInput = {
  date: "2026-10-13",
  yesterday: "2026-10-12",
  staff,
  tasksDoneYesterday: 2,
  reports: [
    { userId: "a", date: "2026-10-12", done: ["d1", "d2", "d3", "d4"], inProgress: [], blockers: ["waiting for prices"] },
    { userId: "a", date: "2026-10-11", done: [], inProgress: [], blockers: ["old blocker"] },
    { userId: "z", date: "2026-10-11", done: ["x"], inProgress: [], blockers: ["truck broken"] },
    { userId: "ceo", date: "2026-10-12", done: [], inProgress: [], blockers: ["not staff"] },
  ],
  openTasks: [
    { id: "t1", ownerId: "a", title: "Late job", status: "todo", deadline: "2026-10-10", overdue: true },
    { id: "t2", ownerId: "t", title: "Stuck job", status: "blocked", deadline: "2026-10-20", overdue: false },
    { id: "t3", ownerId: "t", title: "Fine job", status: "in_progress", deadline: "2026-10-20", overdue: false },
    { id: "t4", ownerId: "t", title: "Finished", status: "done", deadline: "2026-10-01", overdue: true },
  ],
};

describe("buildBriefing", () => {
  const b = buildBriefing(input);

  it("counts from the rows", () => {
    expect(b.numbers).toEqual({ reportsFiled: 1, staffCount: 3, tasksDone: 2, overdueTasks: 1, openBlockers: 2 });
  });

  it("takes blockers only from each person's latest report and ignores non-staff", () => {
    const blockers = b.attention.filter((a) => a.kind === "blocker");
    expect(blockers.map((x) => [x.text, x.detail])).toEqual([
      ["waiting for prices", "2026-10-12"],
      ["truck broken", "2026-10-11"],
    ]);
  });

  it("links every point to its source", () => {
    expect(b.attention.every((a) => a.href.startsWith("/team/"))).toBe(true);
    expect(b.attention.find((a) => a.kind === "overdue")?.href).toBe("/team/a#task-t1");
    expect(b.attention.find((a) => a.kind === "blocker" && a.personId === "a")?.href).toBe("/team/a#report-2026-10-12");
  });

  it("lists overdue and blocked tasks, never finished ones", () => {
    expect(b.attention.filter((a) => a.kind === "overdue").map((a) => [a.text, a.detail])).toEqual([["Late job", "2026-10-10"]]);
    expect(b.attention.filter((a) => a.kind === "blocked_task").map((a) => [a.text, a.detail])).toEqual([["Stuck job", null]]);
  });

  it("names who did not report yesterday, A to Z", () => {
    expect(b.notReported.map((n) => n.name)).toEqual(["Thida", "Zayar"]);
  });

  it("lists people A to Z with at most three done items and no scores", () => {
    expect(b.highlights.map((h) => h.name)).toEqual(["Aung", "Thida", "Zayar"]);
    expect(b.highlights[0].done).toEqual(["d1", "d2", "d3"]);
    expect(JSON.stringify(b)).not.toMatch(/score|rank/i);
  });
});

describe("summary guard", () => {
  const facts = factsForAi(buildBriefing(input));

  it("reads Burmese digits", () => {
    expect(numbersIn("၁၂ ဦး and 07")).toEqual(["12", "7"]);
  });

  it("accepts a summary that only repeats numbers from the facts", () => {
    expect(summaryIsFaithful("1 of 3 reports were filed; 2 blockers are open.", facts)).toBe(true);
    expect(summaryIsFaithful("သုံး ဦးအနက် ၁ ဦး တင်ပြသည်", facts)).toBe(true);
  });

  it("splits an answer into at most four clean lines", () => {
    expect(toSummaryLines("- one\n\n* two\n3. three\n  four  \nfive")).toEqual(["one", "two", "three", "four"]);
  });

  it("rejects an invented number or an empty text", () => {
    expect(summaryIsFaithful("7 reports were filed.", facts)).toBe(false);
    expect(summaryIsFaithful("   ", facts)).toBe(false);
  });
});

describe("resolved blockers", () => {
  it("leave the attention list and the open count", () => {
    const b = buildBriefing({
      ...input,
      reports: [{ userId: "a", date: "2026-10-12", done: [], inProgress: [], blockers: ["x", "y"], resolvedBlockers: ["x"] }],
    });
    expect(b.attention.filter((a) => a.kind === "blocker").map((a) => a.text)).toEqual(["y"]);
    expect(b.numbers.openBlockers).toBe(1);
  });
});

describe("attentionRef", () => {
  const id = "0b0f3b2e-1c1d-4a55-8c2a-1f2e3d4c5b6a";
  it("reads the report or task an item points at", () => {
    expect(attentionRef({ href: "/team/u1#report-2026-10-12", personId: "u1" })).toEqual({ kind: "report", userId: "u1", date: "2026-10-12" });
    expect(attentionRef({ href: `/team/u1#task-${id}`, personId: "u1" })).toEqual({ kind: "task", taskId: id });
    expect(attentionRef({ href: "/team/u1", personId: "u1" })).toBeNull();
  });
});
