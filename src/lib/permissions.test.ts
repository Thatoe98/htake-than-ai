import { describe, expect, it } from "vitest";
import {
  ROLES,
  canApprovePosts,
  canAssignTasks,
  canDraftPosts,
  canManageAccounts,
  canReadBriefing,
  canViewEmployee,
  isCeo,
} from "./permissions";

const ceo = { id: "c1", role: "ceo" };
const writer = { id: "w1", role: "content_writer" };
const staff = { id: "e1", role: "employee" };

describe("permissions", () => {
  it("there are exactly three roles", () => {
    expect([...ROLES]).toEqual(["ceo", "content_writer", "employee"]);
  });

  it("the CEO can do everything", () => {
    expect(isCeo(ceo)).toBe(true);
    expect(canManageAccounts(ceo)).toBe(true);
    expect(canViewEmployee(ceo, "anyone")).toBe(true);
    expect(canAssignTasks(ceo)).toBe(true);
    expect(canDraftPosts(ceo)).toBe(true);
    expect(canApprovePosts(ceo)).toBe(true);
    expect(canReadBriefing(ceo)).toBe(true);
  });

  it("a content writer drafts posts and nothing else", () => {
    expect(canDraftPosts(writer)).toBe(true);
    expect(canApprovePosts(writer)).toBe(false);
    expect(canManageAccounts(writer)).toBe(false);
    expect(canAssignTasks(writer)).toBe(false);
    expect(canReadBriefing(writer)).toBe(false);
    expect(canViewEmployee(writer, "e1")).toBe(false);
    expect(canViewEmployee(writer, "w1")).toBe(true);
  });

  it("an employee sees only their own data and cannot draft posts", () => {
    expect(canViewEmployee(staff, "e1")).toBe(true);
    expect(canViewEmployee(staff, "e2")).toBe(false);
    expect(canManageAccounts(staff)).toBe(false);
    expect(canDraftPosts(staff)).toBe(false);
    expect(canAssignTasks(staff)).toBe(false);
  });

  it("a missing or unknown role grants nothing", () => {
    expect(isCeo({ id: "x" })).toBe(false);
    expect(canManageAccounts({ id: "x", role: null })).toBe(false);
    expect(canDraftPosts({ id: "x", role: "leader" })).toBe(false);
  });
});
