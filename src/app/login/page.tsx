"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/icons";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.username({
      username: String(form.get("username")).trim(),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) {
      setError(error.message ?? "Sign-in failed");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <LogoMark size={52} />
        <div className="flex flex-col gap-1">
          <h1 className="text-gradient text-3xl font-semibold">Htake Than AI</h1>
          <p className="text-sm text-muted">Sign in to continue</p>
        </div>
      </div>
      <form onSubmit={onSubmit} className="glass flex flex-col gap-4 rounded-2xl border p-5 shadow-xl shadow-violet-500/5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Username
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            required
            className="field font-normal"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field font-normal"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <button disabled={busy} className="btn-primary w-full">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
