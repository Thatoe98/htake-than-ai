// Which sections each role sees in the navigation bar. Hiding a link is only a convenience: every page and
// action still checks the role itself (see permissions.ts).
import { canDraftPosts, canManageAccounts, canReadBriefing, type Actor } from "./permissions";

export type NavKey = "briefing" | "team" | "chat" | "studio" | "tasks" | "accounts";

export type NavEntry = {
  key: NavKey;
  href: "/briefing" | "/team" | "/chat" | "/studio" | "/tasks" | "/admin/users";
  /** Paths that count as being inside this section, so the right tab lights up. */
  prefix: string;
};

const ALL: Record<NavKey, NavEntry> = {
  briefing: { key: "briefing", href: "/briefing", prefix: "/briefing" },
  team: { key: "team", href: "/team", prefix: "/team" },
  chat: { key: "chat", href: "/chat", prefix: "/chat" },
  studio: { key: "studio", href: "/studio", prefix: "/studio" },
  tasks: { key: "tasks", href: "/tasks", prefix: "/tasks" },
  accounts: { key: "accounts", href: "/admin/users", prefix: "/admin" },
};

/**
 * Employees: chat and their tasks. Content writers also get the studio. The CEO also gets the briefing, team,
 * studio and accounts.
 */
export function navFor(actor: Actor): NavEntry[] {
  const keys: NavKey[] = [
    ...(canReadBriefing(actor) ? (["briefing"] as const) : []),
    ...(canManageAccounts(actor) ? (["team"] as const) : []),
    "chat",
    ...(canDraftPosts(actor) ? (["studio"] as const) : []),
    "tasks",
    ...(canManageAccounts(actor) ? (["accounts"] as const) : []),
  ];
  return keys.map((k) => ALL[k]);
}

export function isActive(entry: NavEntry, pathname: string): boolean {
  return pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`);
}
