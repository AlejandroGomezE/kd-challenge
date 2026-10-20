"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(undefined);
    setSubmitting(true);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setSubmitting(false);
    if (error) setError(error.message ?? "Sign-in failed");
  }

  if (isPending) return <main className="p-6">Loading…</main>;

  if (session) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
        <p>Signed in as {session.user.email}</p>
        <button className="rounded border px-3 py-2" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="Email" required className="rounded border px-3 py-2" />
        <input name="password" type="password" placeholder="Password" required className="rounded border px-3 py-2" />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={submitting} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
