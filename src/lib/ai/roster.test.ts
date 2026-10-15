import { describe, expect, it } from "vitest";
import { checkAssignee, formatRoster, ROSTER_MAX } from "./roster";

const ZAYAR = { id: "977974d9-3dae-4d8d-98a4-230767f268e3", name: "ကိုဇေယျာထွန်း", username: "zayar_htun", role: "employee" };
const MYAT = { id: "3b648193-a478-4add-8e6a-1a0a429eafd8", name: "မြတ်နိုး", username: "myat_noe", role: "content_writer" };

describe("formatRoster (what the model matches typed names against)", () => {
  it("lists id, name, username and role for each person", () => {
    const text = formatRoster([ZAYAR, MYAT]);
    expect(text).toContain(`${ZAYAR.id} | ${ZAYAR.name} | @zayar_htun | Employee`);
    expect(text).toContain(`${MYAT.id} | ${MYAT.name} | @myat_noe | Content writer`);
  });

  it("says so when there is nobody to assign to", () => {
    expect(formatRoster([])).toMatch(/no one/i);
  });

  it("caps the list so the prompt stays small", () => {
    const many = Array.from({ length: ROSTER_MAX + 25 }, (_, i) => ({ ...ZAYAR, id: String(i), username: `u${i}` }));
    expect(formatRoster(many).split("\n").filter((l) => l.startsWith("- ")).length).toBe(ROSTER_MAX);
  });
});

describe("checkAssignee (server-side guard for assign_task)", () => {
  const base = { actorId: "ceo-id", assigneeId: ZAYAR.id, assigneeName: ZAYAR.name };

  it("accepts an active person whose name matches the id", () => {
    expect(checkAssignee({ ...base, person: { name: ZAYAR.name, banned: false } })).toEqual({ ok: true, name: ZAYAR.name });
  });

  it("ignores spacing and Unicode normalisation differences in the name", () => {
    const decomposed = "ကိုဇေယျာထွန်း".normalize("NFD");
    expect(checkAssignee({ ...base, assigneeName: `  ${decomposed} `, person: { name: ZAYAR.name, banned: false } }).ok).toBe(true);
  });

  it("rejects an unknown or deactivated person", () => {
    expect(checkAssignee({ ...base, person: undefined }).ok).toBe(false);
    expect(checkAssignee({ ...base, person: { name: ZAYAR.name, banned: true } }).ok).toBe(false);
  });

  it("rejects a name that belongs to a different id", () => {
    const r = checkAssignee({ ...base, assigneeName: MYAT.name, person: { name: ZAYAR.name, banned: false } });
    expect(r.ok).toBe(false);
  });

  it("rejects assigning to yourself (own tasks use create_task)", () => {
    const r = checkAssignee({ ...base, actorId: ZAYAR.id, person: { name: ZAYAR.name, banned: false } });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/create_task/) });
  });
});
