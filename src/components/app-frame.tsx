import { type ReactNode, Suspense } from "react";
import { asLocale } from "@/lib/i18n";
import { navFor } from "@/lib/nav";
import { getSession } from "@/lib/session";
import { AppNav } from "./app-nav";

// Reads the session only to decide which links to show. It never redirects: each page still runs requireUser/requireCeo.
async function Nav() {
  const session = await getSession();
  const u = session?.user;
  if (!u || u.banned || u.mustChangePassword || !u.noticeAcceptedAt) return null;
  return <AppNav items={navFor({ id: u.id, role: u.role })} locale={asLocale(u.locale)} name={u.name} />;
}

/** One screen-high column: navigation on top (and tabs at the bottom on phones), the page scrolls in between. */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col">
      <Suspense fallback={<div className="glass h-14 shrink-0 border-b" />}>
        <Nav />
      </Suspense>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
    </div>
  );
}
