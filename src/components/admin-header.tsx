import Link from "next/link";

const TABS = [
  { key: "users", href: "/admin/users", label: "Accounts" },
  { key: "usage", href: "/admin/usage", label: "AI usage" },
  { key: "audit", href: "/admin/audit", label: "Audit log" },
  { key: "settings", href: "/admin/settings", label: "Settings" },
] as const;

export type AdminTab = (typeof TABS)[number]["key"];

/** Title, back link and tab strip shared by every admin page. */
export function AdminHeader({ current, title }: { current: AdminTab; title: string }) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-gradient text-2xl font-semibold md:text-3xl">{title}</h1>
      </div>
      <nav aria-label="Admin sections" className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === current ? "page" : undefined}
            className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition-colors duration-150 ${
              t.key === current ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
