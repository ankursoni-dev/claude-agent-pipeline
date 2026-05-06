---
name: nextjs
description: Use this skill for any task involving Next.js code — writing pages, layouts, components, route handlers, server actions, middleware, or data fetching; designing UI with React Server Components vs Client Components; reviewing Next.js code for performance, hydration correctness, or architectural patterns. Triggers on mentions of Next.js, `next/`, App Router, `page.tsx`, `layout.tsx`, `route.ts`, `use client`, `use server`, server components, client components, server actions, or any Next.js-specific API (`useRouter`, `useSearchParams`, `generateMetadata`, `generateStaticParams`). Does NOT trigger for generic React work without explicit Next.js context.
---

# Next.js Frontend Engineering

## When to use this skill

Apply this skill to any of:

- Writing or reviewing Next.js pages, layouts, components, route handlers, or middleware
- Designing data fetching strategy (server components, server actions, route handlers)
- Deciding between Server Components and Client Components
- Implementing navigation, metadata, or caching patterns
- Code review of Next.js files for performance and correctness

Do NOT apply for plain React, Vite, or non-Next.js frontend work.

---

## Routing — read the matching sub-file

This skill is split into sub-files. Read the file(s) that match the task. Multiple may apply.

| Task signal | Sub-file |
|---|---|
| Writing pages, layouts, components, server actions, route handlers; applying component patterns, data fetching, error handling, caching, testing | `LLD.md` |
| Designing component architecture, choosing Server vs Client Components, building reusable UI patterns, form handling, state management | `COMPONENT-DESIGN.md` |
| Reviewing Next.js code for correctness | `REVIEWER-CHECKLIST.md` |

Worked examples:

- **"Add a dashboard page with server-side data fetching"** -> `LLD.md` (data fetching, page structure, caching) + `COMPONENT-DESIGN.md` (server vs client split)
- **"Create a multi-step form with validation"** -> `COMPONENT-DESIGN.md` (form patterns, client component) + `LLD.md` (server actions for submission)
- **"Review this page component"** -> `REVIEWER-CHECKLIST.md`
- **"Add a new API route for webhooks"** -> `LLD.md` (route handlers, error handling)

---

## Universal defaults — apply regardless of sub-file

These hold across every task; the sub-files assume them and don't repeat them.

### Framework version

Assume **Next.js 15+** (App Router) unless the project's `package.json` specifies otherwise. Pages Router patterns are legacy — do not use unless the project is explicitly on Pages Router.

### App Router file conventions

| File | Purpose | Renders on |
|---|---|---|
| `page.tsx` | Route UI | Server (default) |
| `layout.tsx` | Shared layout (wraps children) | Server (default) |
| `loading.tsx` | Suspense fallback for the segment | Server |
| `error.tsx` | Error boundary for the segment | Client (`'use client'` required) |
| `not-found.tsx` | 404 UI for the segment | Server |
| `route.ts` | API route handler (GET, POST, etc.) | Server only |
| `middleware.ts` | Edge middleware (root only) | Edge runtime |
| `template.tsx` | Like layout but remounts on navigation | Server (default) |

### Layer responsibilities (non-negotiable)

| Layer | Owns | Forbidden |
|---|---|---|
| Server Component | Data fetching, DB access, secrets, heavy computation | useState, useEffect, event handlers, browser APIs |
| Client Component | Interactivity, browser APIs, state, effects | Direct DB access, secrets, fs, server-only modules |
| Route Handler | API endpoints, webhooks, non-UI responses | JSX rendering, React state |
| Server Action | Form submissions, mutations, revalidation | Direct DOM access, browser APIs |
| Middleware | Auth checks, redirects, header modification | DB queries, heavy computation, rendering |

Crossing these lines is a code-review reject.

### Project layout (App Router)

```
src/
  app/
    layout.tsx              # Root layout (html, body, providers)
    page.tsx                # Home page
    globals.css             # Global styles
    (auth)/                 # Route group (no URL segment)
      login/page.tsx
      register/page.tsx
    dashboard/
      layout.tsx            # Dashboard layout
      page.tsx              # Dashboard home
      settings/page.tsx
    api/
      webhooks/route.ts     # Route handler
  components/
    ui/                     # Shared UI primitives (Button, Input, Card)
    features/               # Feature-specific components
  lib/                      # Utilities, API clients, constants
  hooks/                    # Custom React hooks (client-side)
  types/                    # TypeScript type definitions
  actions/                  # Server Actions (grouped by domain)
```

### Response patterns for Route Handlers

| Case | Shape |
|---|---|
| Success (single) | `NextResponse.json({ data: { ... } })` |
| Success (list) | `NextResponse.json({ data: [...], meta: { page, limit, total } })` |
| Error | `NextResponse.json({ error: "MACHINE_CODE", message: "..." }, { status: 4xx })` |
| Redirect | `redirect("/path")` or `NextResponse.redirect(url)` |

### Never do

- Use `"use client"` on a component that doesn't need interactivity. Server Components are the default for a reason.
- Fetch data in Client Components when a Server Component parent could fetch and pass as props.
- Use `useEffect` for data fetching. Use Server Components, server actions, or `use()` with Suspense.
- Put secrets or env vars prefixed without `NEXT_PUBLIC_` in client code.
- Import `fs`, `path`, `crypto` (Node APIs) in Client Components.
- Skip `loading.tsx` for pages with async data fetching — users see a blank screen.
- Use `router.push()` for simple navigation. Use `<Link>` for prefetching.
- Nest Client Components unnecessarily deep — push `"use client"` to the leaf.
