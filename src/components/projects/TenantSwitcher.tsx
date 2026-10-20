"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiClient, queryKeys, type TenantSummary } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { Button } from "../ui";

export function useMyTenants() {
  return useQuery({
    queryKey: queryKeys.myTenants,
    queryFn: () => apiClient.get<{ tenants: TenantSummary[] }>("/api/me/tenants"),
  });
}

export function TenantSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const tenants = useMyTenants();
  return (
    <div className="flex items-center gap-2">
      {tenants.data && tenants.data.tenants.length > 1 && (
        <select
          aria-label="Switch organization"
          value={current}
          onChange={(e) => router.push(`/t/${e.target.value}/projects`)}
          className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
        >
          {tenants.data.tenants.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      )}
      <SignOutButton />
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}
