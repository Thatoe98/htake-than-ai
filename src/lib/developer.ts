// The developer (the person who sells the AI credits and holds the API keys) is not a role the client can see or assign.
// They are an ordinary CEO account whose username is listed in DEVELOPER_USERNAMES (comma separated).
// Only the developer sees what the AI costs in dollars and can set the spending cap; the CEO sees only each
// account's share of the use.

export function developerUsernames(raw: string | undefined = process.env.DEVELOPER_USERNAMES): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isDeveloper(
  user: { role?: string | null; username?: string | null },
  raw: string | undefined = process.env.DEVELOPER_USERNAMES,
): boolean {
  // Must also be a CEO account, so a listed name on a lesser role gains nothing.
  if (user.role !== "ceo" || !user.username) return false;
  return developerUsernames(raw).includes(user.username.toLowerCase());
}
