"use client";

import { useActionState, useState, useTransition } from "react";
import { ROLE_LABEL, ROLES, type Role } from "@/lib/permissions";
import {
  createAccount,
  createTeam,
  resetPassword,
  setActive,
  signOutEverywhere,
  updateAccount,
  type ActionState,
} from "./actions";

const field = "field";
const button = "btn";
const primary = "btn-primary w-full";

type Option = { id: string; name: string };

function Result({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{state.ok}</p>}
      {state.password && (
        <p className="rounded-xl bg-notice-bg p-3 text-sm text-notice-fg">
          Temporary password (shown only once, give it to the person privately):{" "}
          <code className="select-all text-base font-semibold">{state.password}</code>
        </p>
      )}
    </>
  );
}

export function CreateAccountForm({ teams }: { teams: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAccount, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Name
        <input name="name" required maxLength={100} className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Username (lowercase letters, numbers, underscore)
        <input name="username" required minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Role
        <select name="role" defaultValue="employee" className={field}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Team
        <select name="teamId" defaultValue="" className={field}>
          <option value="">No team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Temporary password (leave empty to generate one)
        <input name="password" type="text" autoComplete="off" minLength={8} className={field} />
      </label>
      <button disabled={pending} className={primary}>{pending ? "Creating…" : "Create account"}</button>
      <Result state={state} />
    </form>
  );
}

export function CreateTeamForm({ ceos }: { ceos: Option[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTeam, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        New team name
        <input name="name" required maxLength={100} className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Manager
        <select name="managerId" defaultValue="" className={field}>
          <option value="">No manager</option>
          {ceos.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </label>
      <button disabled={pending} className={primary}>{pending ? "Creating…" : "Create team"}</button>
      <Result state={state} />
    </form>
  );
}

type UserView = {
  id: string;
  name: string;
  username: string | null;
  role: string;
  teamId: string | null;
  banned: boolean | null;
  mustChangePassword: boolean | null;
};

export function UserRow({ user, isSelf, teams }: { user: UserView; isSelf: boolean; teams: Option[] }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const run = (fn: () => Promise<ActionState>) => start(async () => setState(await fn()));

  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="font-medium">
            {user.name}
            {isSelf && <span className="ml-2 text-xs text-muted">(you)</span>}
          </p>
          <p className="text-sm text-muted">
            {user.username} · {ROLE_LABEL[user.role as Role] ?? user.role}
            {user.mustChangePassword ? " · Has not signed in yet" : ""}
          </p>
        </div>
        {user.banned && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">Deactivated</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={pending} onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Edit"}
        </button>
        <button
          className={button}
          disabled={pending}
          onClick={() => {
            if (confirm(`Set a new temporary password for ${user.name}? They will be signed out.`)) run(() => resetPassword(user.id));
          }}
        >
          Reset password
        </button>
        <button className={button} disabled={pending} onClick={() => run(() => signOutEverywhere(user.id))}>
          Sign out everywhere
        </button>
        {user.banned ? (
          <button className={button} disabled={pending} onClick={() => run(() => setActive(user.id, true))}>
            Reactivate
          </button>
        ) : (
          !isSelf && (
            <button
              className={button}
              disabled={pending}
              onClick={() => {
                if (confirm(`Deactivate ${user.name}? Their history is kept.`)) run(() => setActive(user.id, false));
              }}
            >
              Deactivate
            </button>
          )
        )}
      </div>

      {editing && (
        <form
          action={(form) => run(() => updateAccount(user.id, form))}
          className="flex flex-col gap-3 border-t border-line pt-4"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Role
            <select name="role" defaultValue={user.role} disabled={isSelf} className={field}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            {isSelf && <input type="hidden" name="role" value={user.role} />}
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Team
            <select name="teamId" defaultValue={user.teamId ?? ""} className={field}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <button disabled={pending} className={primary}>Save</button>
        </form>
      )}
      <Result state={state} />
    </li>
  );
}
