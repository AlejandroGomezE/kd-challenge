---
title: Frontend architecture
type: infra
summary: Vite + React + strict TypeScript SPA (frontend/) structure and current implementation state — TanStack Query, shadcn/ui, react-router, the HTTP client, cookie-session auth (useAuth, ProtectedRoute / PublicOnlyRoute), forms, theme, the four pages (SignIn, SignUp, SignOut, Home) — and the conventions a new feature follows (query keys, MSW tests).
status: active
last-verified: 2026-10-19
tags: [frontend, react, vite, architecture, tanstack-query, shadcn, auth, theme, forms, tests]
---

## Structure

```text
frontend/src/
├── main.tsx            # <Providers><BrowserRouter><App /></BrowserRouter></Providers>
├── index.css           # Tailwind v4 + shadcn theme tokens (see Theme)
├── app/
│   ├── App.tsx
│   ├── router.tsx      # the <Routes> tree (see Routes)
│   ├── providers.tsx   # QueryClientProvider + AuthProvider (+ devtools in dev)
│   └── query-client.ts # createQueryClient() — central 401 handling
├── components/
│   ├── ui/             # shadcn/ui primitives — see [[UI component inventory]]
│   ├── AuthLayout.tsx  # the frame every page renders in (brand + document.title)
│   └── BrandMark.tsx   # the logo mark (lucide Box in a primary rounded square)
├── hooks/              # use-mobile.ts (stock shadcn)
├── lib/
│   ├── api/            # client.ts — apiClient, ApiError; error-message.ts —
│   │                   #   getApiErrorMessage; types.ts — the API's response shapes
│   ├── auth/           # AuthProvider.tsx, auth-context.ts, use-auth.ts,
│   │                   #   auth-error-message.ts, redirect-target.ts
│   ├── validation/     # auth-schemas.ts (sign-in / sign-up), user-schemas.ts (username,
│   │                   #   display name, RESERVED_USERNAMES)
│   └── utils.ts        # cn() (stock shadcn)
├── pages/              # Home, SignIn, SignUp, SignOut
├── routes/             # ProtectedRoute.tsx, PublicOnlyRoute.tsx
└── test/               # shared test helpers — setup.ts, server.ts (MSW), render.tsx
```

The layout is flat (`pages/`, `components/`, `hooks/`, `lib/`) while there's little in it. When a
feature grows enough to want its own folder, use:

```text
features/<name>/
├── api/
├── components/
├── hooks/
├── schemas/
└── pages/
```

Don't create these folders ahead of a real feature — an empty `features/<name>/` is
dead weight until there's something to put in it.

## Theme (`src/index.css`, `index.html`)

Branded **Starter App** (`index.html`: that `<title>`, `favicon.svg` — the lucide box on a coral
rounded square — and `<meta name="color-scheme" content="light dark">`).

- **Tokens.** `index.css` replaces shadcn's neutral defaults with a warm palette as CSS
  variables: an off-white `--background`, coral `--primary` (`oklch(0.585 0.196 30)`), warm
  borders/muted. The dark palette is defined twice with the same values — under `.dark`, and under
  `@media (prefers-color-scheme: dark)` for `:root:not(.light)`. The `--radius-*` scale derives
  from `--radius`. Use the tokens (`bg-primary`, `text-muted-foreground`, …), never raw colours.
- **Fonts.** Geist Sans (`@fontsource-variable/geist`, `--font-sans`, the default) and Geist
  Mono (`@fontsource-variable/geist-mono`, `--font-mono`).
- **Dark mode follows the OS** — there's no toggle. The `dark:` variant is a custom
  `@custom-variant dark` that matches a `.dark` ancestor **or** `prefers-color-scheme: dark`
  (unless a `.light` ancestor opts out), mirroring the token blocks. The stock shadcn variant
  (`&:is(.dark *)`) only matches a `.dark` class, so under OS dark mode the tokens would switch
  but the `dark:` utilities inside the shadcn primitives would stay inert.
- **Stable scrollbar gutter.** `html { scrollbar-gutter: stable }` keeps the viewport width
  constant between pages with and without a vertical scrollbar. Radix dialogs lock scroll with
  `react-remove-scroll-bar`, which would compensate for the scrollbar a second time, so
  `html body[data-scroll-locked]` zeroes that compensation (`!important`, inside `@layer base`).

## HTTP client (`src/lib/api/client.ts`)

Centralized `apiClient` (`get` / `post` / `put` / `patch` / `delete`, each generic over the
response type) — no component calls `fetch` directly. It:

- Reads `VITE_API_URL` (`frontend/.env`, defaults to `http://localhost:3000` if unset;
  Vite only exposes `VITE_`-prefixed vars to client code). In the Docker image
  (`docker compose up --build`, Runbook → Run with Docker) it's a build arg baked into the
  bundle, so changing it means rebuilding.
- Sets `Content-Type: application/json` and JSON-encodes request bodies.
- Parses the response by its actual `content-type` (JSON vs. text) rather than
  assuming JSON; an empty body (e.g. 204) resolves to `null`.
- Throws a single `ApiError` (status + message + body) on a non-2xx response, so every
  caller handles one error shape.
- Sends `credentials: 'include'` on every request, so the browser attaches the httpOnly
  `sid` session cookie cross-origin (`:5173` → `:3000`). No token is read or attached in
  JS — there's none to read.

**Response types** live in `src/lib/api/types.ts`, mirroring the backend's response DTOs (today
only `AuthUser`). Dates arrive as ISO-8601 strings; nullable fields are `null`, never missing.

**Error text.** `getApiErrorMessage(error, { rateLimitMessage })` (`error-message.ts`) turns a
rejected call into text for an error `Alert`: a fixed friendlier message for 429 ("Too many
attempts. Try again in a minute." unless overridden), Nest validation message arrays joined, else
the server's message, else a generic fallback. `lib/auth/auth-error-message.ts` re-exports it as
`getAuthErrorMessage` for the auth pages.

**Adding endpoints.** Put a feature's calls in a module next to the client
(`src/lib/api/<feature>.ts`) together with its query keys, add the response shapes to
`types.ts`, and consume them through TanStack Query hooks (`src/hooks/` or the feature folder).

## TanStack Query

`QueryClientProvider` lives in `src/app/providers.tsx` (wrapping `AuthProvider`), which
wraps `<BrowserRouter>` + `<App>` in `main.tsx`. React Query Devtools mount in dev only
(`import.meta.env.DEV`). Use it for queries, mutations, cache invalidation,
loading/error states, and retries — don't hand-roll any of that with `useEffect` +
`useState`.

The client comes from `createQueryClient()` (`src/app/query-client.ts`): `staleTime` 30 s,
401s never retried, other failures retried once. It owns the **central 401 handling**: a 401
from any query (other than `['auth', 'me']` itself) or any mutation means the session expired,
so it sets the cached user to `null` (which makes `ProtectedRoute` redirect to `/sign-in`) and
removes every other cached query, so no signed-in data survives into another user's session.

**Query keys.** Arrays, most general segment first, defined once next to the API calls that use
them (`AUTH_ME_QUERY_KEY = ['auth', 'me']` in `lib/auth/auth-context.ts` is the existing one), so
a prefix reaches every related entry for invalidation. Lowercase any user-entered segment that
the backend treats case-insensitively (usernames), so two spellings share one entry.

## Auth (`src/lib/auth/`)

Cookie-session auth against the backend's `/auth/*` endpoints (see
[[Backend architecture]]). The session lives in the httpOnly cookie — JS never sees a
token — so the source of truth is `GET /auth/me`, cached under `['auth', 'me']`
(`null` = signed out; a 401 there resolves to `null` rather than erroring; `staleTime` 5 min).
Only a 401 means signed out: any other `/auth/me` failure (500, network) leaves the query in an
error state (`retry: false` — the user retries via the Retry button). A session survives a
reload because the cookie does.

`useAuth()` (`use-auth.ts`; throws outside `AuthProvider`) returns:

```js
{
  user,             // { id, email, username, displayName } | null (displayName may be null)
  isAuthenticated,  // Boolean(user)
  isLoading,        // the /auth/me query is still pending
  isError,          // /auth/me failed with a non-401 error and there is no cached user
  isFetching,       // /auth/me is (re)fetching — drives the Retry button's spinner
  refetch,          // () → refetch /auth/me (the Retry button)
  signIn,           // ({ email, password }) → POST /auth/sign-in, seeds ['auth', 'me']
  signUp,           // ({ email, password, username, displayName }) → POST /auth/sign-up,
                    //   seeds ['auth', 'me']
  signOut,          // () → POST /auth/sign-out, then user = null and every other query /
                    //   mutation cleared (even if the request fails)
}
```

`signIn` / `signUp` / `signOut` reject with the `ApiError`. `signOut` cancels any in-flight
`/auth/me` before and after the request, so a response authorised by the revoked session can't
write the user back. With an httpOnly cookie session there's no `getAccessToken()` — see
[[Code quality]].

## Forms

React Hook Form for form state, Zod for the schema and validation messages,
`zodResolver` from `@hookform/resolvers` to bridge the two. Schemas live in
`src/lib/validation/`:

- `auth-schemas.ts` — `signInSchema` (email + a non-empty password) and `signUpSchema`
  (`displayName`, `username`, `email`, `password` 12–128, `confirmPassword` must match).
- `user-schemas.ts` — `usernameSchema`, `displayNameSchema`, `RESERVED_USERNAMES`, the length
  constants — mirroring `backend/src/modules/users/username.rules.ts`: username trimmed +
  lowercased, 3–20 chars of `[a-z0-9_]`, not reserved; display name ("Name") trimmed, 1–50 code
  points (an emoji counts 1, like the backend — not zod's `.max`, which counts UTF-16 units), no
  line breaks. The reserved list must match the backend's.

The backend stays the source of truth. Pages use `noValidate` forms, show field errors inline
(shadcn `Field` / `FieldError`) and the server error in a destructive `Alert`, and disable submit
with a `Spinner` while submitting.

## Routes

`src/app/router.tsx`:

- `/sign-in`, `/sign-up` — inside `PublicOnlyRoute`: signed-in users go to
  `getRedirectTarget(location.state.from)` (`src/lib/auth/redirect-target.ts` — in-app
  paths only; `//host`, `/\host`, non-strings → `/`), else `/`. Because signIn/signUp
  seed `['auth', 'me']`, this is what sends a freshly signed-in user back. `SignIn` also
  navigates to the same target, so it works outside the guard.
- `/sign-out` — public; the app's single sign-out path (calls `signOut()` once on
  mount — guarded against StrictMode's double effect — then → `/sign-in`).
- `/` (`Home`) and a `*` catch-all (→ `/`) — inside `ProtectedRoute`: signed-out users
  go to `/sign-in` with `state.from`, and `PublicOnlyRoute` sends them back there afterwards.

Both route guards (`src/routes/`) show a spinner while `isLoading`. When `/auth/me`
fails with a non-401 error (`isError`), `ProtectedRoute` shows a centered destructive
`Alert` ("Couldn't reach the server…") with a Retry `Button` (calls `refetch`, spinner
while fetching) instead of redirecting; `PublicOnlyRoute` still renders the
sign-in / sign-up page, whose submit surfaces its own error.

A new gated page is a `<Route>` inside the `ProtectedRoute` element, before the `*` catch-all.

## Pages

Every page renders inside `AuthLayout` (`components/AuthLayout.tsx`): centred on the page
background, `BrandMark` + "Starter App" above a `max-w-sm` column, and `document.title` set to
`<title> · Starter App` while mounted (the previous title restored on unmount).

- **SignIn** — email + password in a `Card`; links to sign-up.
- **SignUp** — Name (sent as `displayName`), Username, Email, Password, Confirm password.
- **SignOut** — a spinner while `signOut()` runs, then `<Navigate to="/sign-in">` once the
  context reports signed out.
- **Home** (`/`) — a `Card` with the user's display name (or username), `@username`, email and
  a "Sign out" link to `/sign-out`. The placeholder for the first real feature.

A page that needs a different frame (e.g. an app shell with navigation) should get its own layout
component or layout route rather than stretching `AuthLayout`.

## Tests

Vitest + jsdom + React Testing Library + MSW (`npm test`; config in `vite.config.ts`'s
`test` block). Tests live in a `__tests__/` folder next to the file they cover
(`pages/Home.tsx` → `pages/__tests__/Home.test.tsx`). Render through
`renderWithProviders(ui, { route })` (`src/test/render.tsx` — a fresh `createQueryClient()` with
no retries, so the central 401 handling applies, plus `AuthProvider` and a `MemoryRouter`; it
returns `user` from `userEvent.setup()` and the `queryClient`) and fake the backend with MSW
handlers from `src/test/server.ts` (`server.use(http.get(apiUrl('/path'), …))`) — never mock
`apiClient` or `fetch`, so the real client (URL building, JSON parsing, `ApiError`) is exercised.
`VITE_API_URL` is pinned to `http://api.test` in tests. Unhandled requests fail the test.

Tests render **signed in** by default: the only default handler is `GET /auth/me` → `{ id: 'u1',
email: 'ada@example.com', username: 'ada', displayName: 'Ada' }`; override it with a 401 to render
signed out. A new feature that the default render hits on every page should add a default
handler there; otherwise override per test. `src/components/ui/*` (shadcn) isn't tested.
Reference tests: `src/pages/__tests__/Home.test.tsx`, `src/pages/__tests__/SignIn.test.tsx`,
`src/lib/api/__tests__/client.test.ts`, `src/app/__tests__/router.test.tsx`.

Gotchas:

- jsdom has no `ResizeObserver` or `IntersectionObserver`: Radix tooltips can't open, and
  anything observer-driven needs `vi.stubGlobal(...)` with a small fake plus
  `vi.unstubAllGlobals()` in `afterEach`.
- jsdom can't evaluate CSS breakpoints; check responsive layout in Playwright instead.

**Browser E2E** (`frontend/e2e/`, Playwright + Chromium, `npm run test:e2e`) runs against the
real stack: `playwright.config.ts` starts its own backend on :3100 (built, against a fresh
`backend/prisma/playwright.db`) and Vite on :5174, with one worker because the auth endpoints are
rate limited (5/min per IP per route — the suite shares that budget). `e2e/helpers.ts` has
`uniqueUser()` and `signUp()`; `e2e/auth.spec.ts` covers sign up → Home → sign out → gated
redirect → sign in, and a wrong password.
