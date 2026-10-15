import { describe, expect, it } from "vitest";
import { developerUsernames, isDeveloper } from "./developer";

describe("developer access", () => {
  it("reads a comma separated list, trimmed and lower-case", () => {
    expect(developerUsernames(" Leader, dev2 ,")).toEqual(["leader", "dev2"]);
    expect(developerUsernames(undefined)).toEqual([]);
    expect(developerUsernames("")).toEqual([]);
  });

  it("is true only for a listed CEO account", () => {
    expect(isDeveloper({ role: "ceo", username: "leader" }, "leader")).toBe(true);
    expect(isDeveloper({ role: "ceo", username: "Leader" }, "leader")).toBe(true);
    expect(isDeveloper({ role: "ceo", username: "htakethanceo" }, "leader")).toBe(false);
    expect(isDeveloper({ role: "employee", username: "leader" }, "leader")).toBe(false);
    expect(isDeveloper({ role: "ceo", username: null }, "leader")).toBe(false);
  });

  it("is false for everyone when nothing is configured", () => {
    expect(isDeveloper({ role: "ceo", username: "leader" }, "")).toBe(false);
  });
});
