import { Suspense } from "react";
import { asLocale, t } from "@/lib/i18n";
import { canDraftPosts } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { loadStyles } from "@/lib/studio/style-store";
import { StudioClient } from "./studio-client";

// The role check is here for the page and again inside every action: the UI is never the only gate.
async function Studio() {
  const user = await requireUser();
  const locale = asLocale(user.locale);
  if (!canDraftPosts({ id: user.id, role: user.role })) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
        <p role="alert" className="card p-5 text-sm">
          {t(locale, "studioDenied")}
        </p>
      </main>
    );
  }
  const styles = await loadStyles(user.id);
  return <StudioClient locale={locale} initialWriting={styles.writing} initialImage={styles.image} />;
}

export default function StudioPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <Studio />
    </Suspense>
  );
}
