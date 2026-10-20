"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ApiError } from "@/lib/api-client";
import { SignOutButton, useMyTenants } from "@/components/projects/TenantSwitcher";
import { Alert } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const tenants = useMyTenants();
  const signedOut = tenants.error instanceof ApiError && tenants.error.status === 401;
  const only = tenants.data?.tenants.length === 1 ? tenants.data.tenants[0] : undefined;

  useEffect(() => {
    if (signedOut) router.replace("/sign-in");
    else if (only) router.replace(`/t/${only.slug}/projects`);
  }, [signedOut, only, router]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">TenantDesk</h1>
      {tenants.isPending || signedOut || only ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : tenants.isError ? (
        <Alert onRetry={() => tenants.refetch()}>Couldn&apos;t load your organizations.</Alert>
      ) : tenants.data.tenants.length === 0 ? (
        <p className="text-sm">You aren&apos;t a member of any organization yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tenants.data.tenants.map((t) => (
            <li key={t.slug}>
              <Link href={`/t/${t.slug}/projects`} className="underline">
                {t.name}
              </Link>{" "}
              <span className="text-xs text-zinc-500">({t.role})</span>
            </li>
          ))}
        </ul>
      )}
      {!tenants.isPending && !signedOut && <SignOutButton />}
    </main>
  );
}
