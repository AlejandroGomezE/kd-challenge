import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">TenantDesk</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Starter — framework + auth only.</p>
      <Link href="/sign-in" className="underline">
        Sign in
      </Link>
    </main>
  );
}
