import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { AdminHeader } from "@/components/admin-header";
import { db } from "@/db";
import { teams, users } from "@/db/schema";
import { requireCeo } from "@/lib/session";
import { CreateAccountForm, CreateTeamForm, UserRow } from "./users-client";

async function Users() {
  const me = await requireCeo();
  const [allUsers, allTeams] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        role: users.role,
        teamId: users.teamId,
        banned: users.banned,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .orderBy(asc(users.name)),
    db.select({ id: teams.id, name: teams.name, managerId: teams.managerId }).from(teams).orderBy(asc(teams.name)),
  ]);
  const teamOptions = allTeams.map((t) => ({ id: t.id, name: t.name }));
  const ceos = allUsers.filter((u) => u.role === "ceo" && !u.banned).map((u) => ({ id: u.id, name: u.name }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <AdminHeader current="users" title="Accounts" />

      {/* Phone: one column. Desktop: the people list is the main area, create forms sit beside it. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-10">
        <section aria-labelledby="people" className="flex flex-col gap-3 lg:order-1">
          <h2 id="people" className="text-base font-semibold">People ({allUsers.length})</h2>
          <ul className="flex flex-col gap-3">
            {allUsers.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === me.id} teams={teamOptions} />
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-8 lg:order-2">
          <section aria-labelledby="new-account" className="flex flex-col gap-3">
            <h2 id="new-account" className="text-base font-semibold">New account</h2>
            <CreateAccountForm teams={teamOptions} />
          </section>

          <section aria-labelledby="teams" className="flex flex-col gap-3">
            <h2 id="teams" className="text-base font-semibold">Teams</h2>
            {allTeams.length === 0 ? (
              <p className="text-sm text-muted">No teams yet.</p>
            ) : (
              <ul className="text-sm">
                {allTeams.map((t) => (
                  <li key={t.id}>
                    {t.name}
                    {t.managerId ? ` — manager: ${allUsers.find((u) => u.id === t.managerId)?.name ?? "unknown"}` : ""}
                  </li>
                ))}
              </ul>
            )}
            <CreateTeamForm ceos={ceos} />
          </section>
        </div>
      </div>
    </main>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<main className="flex-1" aria-busy="true" />}>
      <Users />
    </Suspense>
  );
}
