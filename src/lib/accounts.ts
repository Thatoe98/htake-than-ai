// Pure rules for admin-created accounts (A-1, A-2). No database access, so it is easy to test.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 8;
const USERNAME_RE = /^[a-z0-9_]+$/;

// No 0/O, 1/l/I: temporary passwords get read out loud or typed from a phone screen.
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type NewAccountInput = {
  name: string;
  username: string;
  role: string;
  teamId: string | null;
  password: string; // empty = generate one
};

export type NewAccount = Omit<NewAccountInput, "password"> & { password: string; generated: boolean };

export type ValidationResult = { ok: true; value: NewAccount } | { ok: false; error: string };

export function generateTempPassword(randomInt: (max: number) => number, length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

export function validateNewAccount(
  input: NewAccountInput,
  randomInt: (max: number) => number,
  roles: readonly string[],
): ValidationResult {
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  if (!name) return { ok: false, error: "Enter the person's name." };
  if (name.length > 100) return { ok: false, error: "The name is too long." };
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return { ok: false, error: `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters.` };
  }
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: "Username may only use lowercase letters, numbers and underscore." };
  }
  if (!roles.includes(input.role)) return { ok: false, error: "Choose a role." };
  if (input.password && input.password.length < PASSWORD_MIN) {
    return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  }
  const generated = !input.password;
  return {
    ok: true,
    value: {
      name,
      username,
      role: input.role,
      teamId: input.teamId || null,
      password: generated ? generateTempPassword(randomInt) : input.password,
      generated,
    },
  };
}

type Person = { id: string; role: string; banned: boolean | null };

/** Why this change to an account is not allowed, or null if it is. Keeps at least one active CEO. */
export function accountChangeBlocker(
  actorId: string,
  target: Person,
  change: { deactivate?: boolean; newRole?: string },
  allUsers: readonly Person[],
): string | null {
  const losesCeo = target.role === "ceo" && (change.deactivate || (change.newRole && change.newRole !== "ceo"));
  if (change.deactivate && target.id === actorId) return "You cannot deactivate your own account.";
  if (change.newRole && target.id === actorId && change.newRole !== target.role) return "You cannot change your own role.";
  if (losesCeo) {
    const otherActiveCeos = allUsers.filter((u) => u.id !== target.id && u.role === "ceo" && !u.banned);
    if (otherActiveCeos.length === 0) return "There must be at least one active CEO.";
  }
  return null;
}
