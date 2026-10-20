---
title: UI component inventory
type: infra
summary: Inventory of frontend/src/components/ui — all stock shadcn/ui, installed via `shadcn add --all` — plus the two app components built outside it (AuthLayout, BrandMark) and which primitives the pages use today. Grounds the shadcn-first convention in knowledge/decisions/shadcn-component-preference.md.
status: active
last-verified: 2026-10-19
tags: [frontend, shadcn, ui, design-system]
---

# `frontend/src/components/ui` — component inventory

Not a separate package — these are plain files living directly in `frontend/src/`,
imported via the `@/components/ui/*` alias (`frontend/components.json`: style
`radix-nova`, base color `neutral`, CSS-variable theming, icon library `lucide`, `tsx: true` —
the frontend is TypeScript, so `shadcn add` generates `.tsx`).

All 61 files were installed via `npx shadcn@latest add --all` and are **unmodified stock
shadcn/ui** — no custom primitive has been added, and no app-specific widget lives in this
folder; those are compositions outside `ui/` (below). Per [[Shadcn component preference]],
default to one of these over hand-rolling an equivalent; build a new one only when nothing here
fits, and it needs Alejandro's review before being accepted. Most are unused today — they're kept
so new features can reach for them.

## Stock shadcn/ui components

`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `attachment`, `avatar`, `badge`,
`breadcrumb`, `bubble`, `button`, `button-group`, `calendar` (react-day-picker), `card`,
`carousel` (embla), `chart` (Recharts theming wrapper), `checkbox`, `collapsible`,
`combobox`, `command` (cmdk), `context-menu`, `dialog`, `direction`, `drawer` (vaul),
`dropdown-menu`, `empty`, `field`, `hover-card`, `input`, `input-group`, `input-otp`,
`item`, `kbd`, `label`, `marker`, `menubar`, `message`, `message-scroller`,
`native-select`, `navigation-menu`, `pagination`, `popover`, `progress`,
`questionnaire`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`,
`sheet`, `sidebar` (stock shadcn app-shell sidebar block), `skeleton`, `slider`,
`sonner` (toasts), `spinner`, `switch`, `table`, `tabs`, `textarea`, `toggle`,
`toggle-group`, `tooltip`.

**Used by the app today:** `alert` (form and route-guard errors), `button`, `card` (every page's
content), `field` (`Field`, `FieldGroup`, `FieldLabel`, `FieldDescription`, `FieldError` in the
sign-in / sign-up forms), `input`, `spinner` (loading states, submit buttons, sign-out).

## App components

No new primitive. App-level compositions live in `frontend/src/components/` (outside `ui/`):

- `AuthLayout.tsx` — `AuthLayout({ title, className, children })`, the centred frame every page
  renders in (`/sign-in`, `/sign-up`, `/sign-out`, `/`): `BrandMark` + "Starter App" above a
  `max-w-sm` column, and `document.title` = `<title> · Starter App` while mounted. No shadcn
  primitive (the pages put a `Card` inside it).
- `BrandMark.tsx` — `BrandMark({ className, iconClassName })`, the logo: lucide `Box` in a
  `bg-primary` rounded square, decorative (`aria-hidden`). No shadcn primitive. Used by
  `AuthLayout`; `public/favicon.svg` draws the same mark.

Both have tests in `components/__tests__/`.

## Shared hooks / utils

- `hooks/use-mobile.ts` — `useIsMobile()`, matchMedia 768px breakpoint (stock shadcn
  sidebar-support hook). Leave it as shadcn ships it rather than hand-patching vendor code.
- `lib/utils.ts` — `cn()`, the stock shadcn `clsx` + `tailwind-merge` helper.
