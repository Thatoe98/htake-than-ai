import { describe, expect, it } from "vitest";
import { accountChangeBlocker, generateTempPassword, validateNewAccount, type NewAccountInput } from "./accounts";

const roles = ["ceo", "content_writer", "employee"];
const fixed = (n: number) => n % 7; // deterministic "random"
const base: NewAccountInput = {
  name: "  Aung Aung ",
  username: " Aung_01 ",
  role: "employee",
  teamId: "",
  password: "",
};

describe("validateNewAccount", () => {
  it("normalises the name and username and generates a temporary password", () => {
    const r = validateNewAccount(base, fixed, roles);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("Aung Aung");
    expect(r.value.username).toBe("aung_01");
    expect(r.value.teamId).toBeNull();
    expect(r.value.generated).toBe(true);
    expect(r.value.password).toHaveLength(10);
  });

  it("keeps a password the CEO typed", () => {
    const r = validateNewAccount({ ...base, password: "hello-world" }, fixed, roles);
    expect(r.ok && r.value.password).toBe("hello-world");
    expect(r.ok && r.value.generated).toBe(false);
  });

  it("accepts a Burmese name", () => {
    expect(validateNewAccount({ ...base, name: "မောင်မောင်" }, fixed, roles).ok).toBe(true);
  });

  it.each([
    [{ name: "   " }, /name/i],
    [{ username: "ab" }, /3-30/],
    [{ username: "a".repeat(31) }, /3-30/],
    [{ username: "has space" }, /lowercase/],
    [{ username: "a.b.c" }, /lowercase/],
    [{ role: "admin" }, /role/i],
    [{ password: "short" }, /at least 8/],
  ])("rejects %j", (patch, message) => {
    const r = validateNewAccount({ ...base, ...patch }, fixed, roles);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(message);
  });
});

describe("generateTempPassword", () => {
  it("only uses unambiguous characters", () => {
    let i = 0;
    const pw = generateTempPassword(() => i++ % 50, 200);
    expect(pw).not.toMatch(/[01OIl]/);
  });
});

describe("accountChangeBlocker", () => {
  const me = { id: "me", role: "ceo", banned: false };
  const other = { id: "o", role: "ceo", banned: false };
  const staff = { id: "s", role: "employee", banned: false };

  it("blocks deactivating yourself and changing your own role", () => {
    expect(accountChangeBlocker("me", me, { deactivate: true }, [me, other])).toMatch(/own account/);
    expect(accountChangeBlocker("me", me, { newRole: "employee" }, [me, other])).toMatch(/own role/);
  });

  it("keeps at least one active CEO", () => {
    expect(accountChangeBlocker("me", other, { deactivate: true }, [me, other])).toBeNull();
    expect(accountChangeBlocker("me", other, { deactivate: true }, [me, { ...other, banned: true }, staff])).toBeNull();
    const lone = { ...me, banned: true };
    expect(accountChangeBlocker("me", other, { newRole: "employee" }, [lone, other])).toMatch(/at least one/);
    expect(accountChangeBlocker("me", other, { deactivate: true }, [lone, other])).toMatch(/at least one/);
  });

  it("allows ordinary changes", () => {
    expect(accountChangeBlocker("me", staff, { deactivate: true }, [me, staff])).toBeNull();
    expect(accountChangeBlocker("me", staff, { newRole: "ceo" }, [me, staff])).toBeNull();
  });
});
