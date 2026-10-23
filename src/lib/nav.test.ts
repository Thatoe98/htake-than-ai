import { describe, expect, it } from "vitest";
import { isActive, navFor } from "./nav";

const keys = (role: string) => navFor({ id: "u", role }).map((e) => e.key);

describe("navFor", () => {
  it("gives the CEO every section", () => {
    expect(keys("ceo")).toEqual(["briefing", "team", "chat", "studio", "tasks", "accounts"]);
  });

  it("gives content writers chat, the studio and tasks", () => {
    expect(keys("content_writer")).toEqual(["chat", "studio", "tasks"]);
  });

  it("gives employees only chat and tasks", () => {
    expect(keys("employee")).toEqual(["chat", "tasks"]);
  });

  it("gives nothing extra to an unknown role", () => {
    expect(keys("nonsense")).toEqual(["chat", "tasks"]);
  });
});

describe("isActive", () => {
  const [, team, , studio, , accounts] = navFor({ id: "u", role: "ceo" });

  it("matches the section and everything under it", () => {
    expect(isActive(team, "/team")).toBe(true);
    expect(isActive(team, "/team/abc/chat")).toBe(true);
    expect(isActive(accounts, "/admin/usage")).toBe(true);
    expect(isActive(studio, "/studio")).toBe(true);
  });

  it("does not match a path that only shares letters", () => {
    expect(isActive(team, "/teamwork")).toBe(false);
    expect(isActive(accounts, "/chat")).toBe(false);
    expect(isActive(studio, "/studios")).toBe(false);
  });
});
