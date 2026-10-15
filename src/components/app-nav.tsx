"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useTransition } from "react";
import { setLocale } from "@/app/chat/actions";
import { ClipboardCheckIcon, ListTodoIcon, LogOutIcon, LogoMark, MessageIcon, SparklesIcon, UsersIcon } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { type Locale, type MessageKey, t } from "@/lib/i18n";
import { isActive, type NavEntry, type NavKey } from "@/lib/nav";

const ICON: Record<NavKey, ReactNode> = {
  briefing: <SparklesIcon width={22} height={22} />,
  team: <ClipboardCheckIcon width={22} height={22} />,
  chat: <MessageIcon width={22} height={22} />,
  tasks: <ListTodoIcon width={22} height={22} />,
  accounts: <UsersIcon width={22} height={22} />,
};

const LABEL: Record<NavKey, MessageKey> = {
  briefing: "navBriefing",
  team: "team",
  chat: "chat",
  tasks: "navTasks",
  accounts: "accounts",
};

/**
 * Labelled navigation for every signed-in page. Wide screens get a top bar with text links; phones get a slim top
 * bar (name, language, sign out) and a bottom tab bar with an icon and a word for each section.
 */
export function AppNav({ items, locale, name }: { items: NavEntry[]; locale: Locale; name: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();

  const toggleLocale = () =>
    startSwitch(async () => {
      await setLocale(locale === "my" ? "en" : "my");
      router.refresh();
    });

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  const textBtn =
    "inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:opacity-60";

  return (
    <>
      <header lang={locale} className="glass shrink-0 border-b">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-3 md:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={t(locale, "appName")}>
            <LogoMark />
            <span className="text-base font-semibold">{t(locale, "appName")}</span>
          </Link>

          <nav aria-label={t(locale, "navMenu")} className="ml-4 hidden items-center gap-1 md:flex">
            {items.map((e) => {
              const active = isActive(e, pathname);
              return (
                <Link
                  key={e.key}
                  href={e.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-colors duration-150 ${
                    active ? "bg-brand-soft text-brand-text" : "text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  <span className="[&>svg]:size-[18px]">{ICON[e.key]}</span>
                  {t(locale, LABEL[e.key])}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <span className="mr-1 hidden max-w-48 truncate text-sm text-muted lg:inline">{name}</span>
            <button onClick={toggleLocale} disabled={switching} className={textBtn}>
              {t(locale, "switchLanguage")}
            </button>
            <button onClick={signOut} className={textBtn}>
              <LogOutIcon width={18} height={18} />
              <span>{t(locale, "signOut")}</span>
            </button>
          </div>
        </div>
      </header>

      <nav
        lang={locale}
        aria-label={t(locale, "navMenu")}
        className="glass fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto flex max-w-xl items-stretch justify-around px-1">
          {items.map((e) => {
            const active = isActive(e, pathname);
            return (
              <li key={e.key} className="min-w-0 flex-1">
                <Link
                  href={e.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-medium leading-tight transition-colors duration-150 ${
                    active ? "text-brand-text" : "text-muted hover:text-fg"
                  }`}
                >
                  <span
                    className={`inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150 ${
                      active ? "bg-brand-soft" : ""
                    }`}
                  >
                    {ICON[e.key]}
                  </span>
                  <span className="max-w-full truncate">{t(locale, LABEL[e.key])}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
