import { Suspense } from "react";
import { redirect } from "next/navigation";
import { canReadBriefing } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

// The CEO lands on the morning briefing, everyone else in the chat; requireUser sends signed-out and first-login users elsewhere.
async function GoHome(): Promise<null> {
  const user = await requireUser();
  redirect(canReadBriefing({ id: user.id, role: user.role }) ? "/briefing" : "/chat");
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <GoHome />
    </Suspense>
  );
}
