import { Suspense } from "react";
import { AdminHeader } from "@/components/admin-header";
import { isDeveloper } from "@/lib/developer";
import { requireCeo } from "@/lib/session";
import { getMonthlyCapUsd, getTimezone } from "@/lib/settings";
import { SettingsForm } from "./settings-form";

async function Settings() {
  const user = await requireCeo();
  const dev = isDeveloper({ role: user.role, username: user.username });
  const [cap, tz] = await Promise.all([getMonthlyCapUsd(), getTimezone()]);
  // The spending cap is in dollars, so only the developer sees and changes it.
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <AdminHeader current="settings" title="Settings" />
      <SettingsForm capUsd={dev ? cap : null} timezone={tz} />
    </main>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <Settings />
    </Suspense>
  );
}
