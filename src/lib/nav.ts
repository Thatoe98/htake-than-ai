// Which sections each role sees in the navigation bar. Hiding a link is only a convenience: every page and
// action still checks the role itself (see permissions.ts).
import { canManageAccounts, canReadBriefing, type Actor } from "./permissions";

export type NavKey = "briefing" | "team" | "chat" | "tasks" | "accounts";

export type NavEntry = {
  key: NavKey;
  href: "/briefing" | "/team" | "/chat" | "/tasks" | "/admin/users";
  /** Paths that count as being inside this section, so the right tab lights up. */
  prefix: string;
};

const ALL: Record<NavKey, NavEntry> = {
  briefing: { key: "briefing", href: "/briefing", prefix: "/briefing" },
  team: { key: "team", href: "/team", prefix: "/team" },
  chat: { key: "chat", href: "/chat", prefix: "/chat" },
  tasks: { key: "tasks", href: "/tasks", prefix: "/tasks" },
  accounts: { key: "accounts", href: "/admin/users", prefix: "/admin" },
};

/** Employees and content writers: chat and their tasks. The CEO also gets the briefing, team and accounts. */
export function navFor(actor: Actor): NavEntry[] {
  const keys: NavKey[] = [
    ...(canReadBriefing(actor) ? (["briefing"] as const) : []),
    ...(canManageAccounts(actor) ? (["team"] as const) : []),
    "chat",
    "tasks",
    ...(canManageAccounts(actor) ? (["accounts"] as const) : []),
  ];
  return keys.map((k) => ALL[k]);
}

export function isActive(entry: NavEntry, pathname: string): boolean {
  return pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`);
}
