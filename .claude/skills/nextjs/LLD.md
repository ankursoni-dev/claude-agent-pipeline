# Low-Level Design — Next.js Code Writing & Review Reference

> **Purpose**: Authoritative reference for writing or reviewing Next.js (App Router) code.
> Apply these rules to every file touched. Flag every violation found during review.
> **Framework context**: Next.js 15+ with App Router.

---

## How to use this document

- **Writing code**: check each section before committing any page, component, or route handler.
- **Reviewing code**: scan each section top-to-bottom; raise a finding for every violation.

---

## 1. Server Components vs Client Components

### Decision rule

Default to Server Component. Only add `"use client"` when the component needs:
- `useState`, `useReducer`, `useEffect`, `useRef` (with DOM mutations)
- Event handlers (`onClick`, `onChange`, `onSubmit`)
- Browser APIs (`window`, `document`, `localStorage`)
- Third-party libraries that use React context or hooks

### Composition pattern

```typescript
// Server Component (default) — fetches data, renders static parts
// src/app/dashboard/page.tsx
import { getMetrics } from "@/lib/data";
import { MetricsChart } from "@/components/features/MetricsChart";

export default async function DashboardPage() {
  const metrics = await getMetrics();
  return (
    <div>
      <h1>Dashboard</h1>
      {/* Client Component receives serializable props */}
      <MetricsChart data={metrics} />
    </div>
  );
}

// Client Component — handles interactivity
// src/components/features/MetricsChart.tsx
"use client";
import { useState } from "react";

export function MetricsChart({ data }: { data: Metric[] }) {
  const [range, setRange] = useState("7d");
  // interactive chart rendering
}
```

### What can cross the boundary

Props passed from Server to Client Components must be **serializable**: strings, numbers, booleans, arrays, plain objects, Date, Map, Set, BigInt, typed arrays. NOT: functions, classes, symbols, DOM nodes, React elements (unless as `children`).

---

## 2. Data Fetching

### Hierarchy of approaches

| Approach | When to use | Where |
|---|---|---|
| Direct DB/ORM call | Internal data, no API boundary needed | Server Components, Server Actions |
| `fetch()` in Server Component | External APIs, needs caching/revalidation | Server Components |
| Server Actions | Mutations, form submissions | Client/Server Components |
| Route Handlers | Webhooks, non-React consumers, third-party callbacks | `app/api/` |
| Client-side fetch | Real-time data, user-specific polling | Client Components (with SWR/React Query) |

### Server Component fetching

```typescript
// Next.js extends fetch with caching options
async function getUsers() {
  const res = await fetch("https://api.example.com/users", {
    next: { revalidate: 60 }, // ISR: revalidate every 60s
  });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

// For no-cache (always fresh):
// { cache: "no-store" }

// For static (build-time only):
// { cache: "force-cache" } (default)
```

### Request deduplication

Next.js automatically deduplicates `fetch()` calls with the same URL and options within a single render pass. Do NOT manually cache or memoize fetch calls in Server Components.

---

## 3. Server Actions

### Rules

- Always mark with `"use server"` (either file-level or function-level).
- Always validate input. Never trust client data.
- Always return structured results, not raw errors.
- Call `revalidatePath()` or `revalidateTag()` after mutations.

```typescript
// src/actions/users.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export async function createUser(formData: FormData) {
  const parsed = CreateUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // DB operation
  await db.user.create({ data: parsed.data });
  revalidatePath("/users");
  return { success: true };
}
```

### Form integration

```typescript
"use client";
import { useActionState } from "react";
import { createUser } from "@/actions/users";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, null);

  return (
    <form action={action}>
      <input name="name" />
      {state?.error?.name && <p>{state.error.name}</p>}
      <button disabled={pending}>
        {pending ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
```

---

## 4. Route Handlers

```typescript
// src/app/api/webhooks/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // validate, process
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: "PROCESSING_FAILED", message: "..." },
      { status: 500 }
    );
  }
}

// Supported exports: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
```

### Rules

- Always handle errors — unhandled exceptions return 500 with no body.
- Always validate input from `request.json()` or `request.formData()`.
- Use `NextResponse.json()` for JSON responses (sets Content-Type automatically).
- For streaming: return `new Response(stream)`.

---

## 5. Error Handling

### Error boundaries

```typescript
// src/app/dashboard/error.tsx
"use client"; // error.tsx MUST be a Client Component

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

### Not-found handling

```typescript
// src/app/users/[id]/page.tsx
import { notFound } from "next/navigation";

export default async function UserPage({ params }: { params: { id: string } }) {
  const user = await getUser(params.id);
  if (!user) notFound(); // renders nearest not-found.tsx
  return <UserProfile user={user} />;
}
```

### Global error boundary

`src/app/global-error.tsx` catches errors in the root layout. It must render its own `<html>` and `<body>` tags.

---

## 6. Metadata & SEO

```typescript
// Static metadata
export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your project dashboard",
};

// Dynamic metadata
export async function generateMetadata({ params }): Promise<Metadata> {
  const user = await getUser(params.id);
  return {
    title: user.name,
    openGraph: { images: [user.avatar] },
  };
}
```

---

## 7. Caching & Revalidation

| Strategy | How | When |
|---|---|---|
| Static (default) | `fetch()` with default cache | Data rarely changes |
| Time-based ISR | `{ next: { revalidate: N } }` | Data changes periodically |
| On-demand | `revalidatePath()` / `revalidateTag()` | After mutations |
| No cache | `{ cache: "no-store" }` | Always-fresh data |
| Route segment config | `export const dynamic = "force-dynamic"` | Entire page always fresh |

### Cache tags

```typescript
// Fetching with tag
fetch(url, { next: { tags: ["users"] } });

// Invalidating by tag (in a Server Action or Route Handler)
revalidateTag("users");
```

---

## 8. Middleware

```typescript
// src/middleware.ts (root level only)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Auth check example
  const token = request.cookies.get("token");
  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
```

### Rules

- Middleware runs on the Edge Runtime — no Node.js APIs (fs, crypto.subtle, etc.).
- Keep middleware fast — it runs on EVERY matched request.
- Use `matcher` to limit scope. Never run middleware on static assets.
- No heavy computation, DB queries, or long-running operations.

---

## 9. Image & Font Optimization

```typescript
// Always use next/image for images
import Image from "next/image";
<Image src="/photo.jpg" alt="desc" width={800} height={600} />

// Always use next/font for fonts
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"] });
```

### Rules

- Never use raw `<img>` tags. `next/image` handles lazy loading, sizing, and format optimization.
- Never load fonts via `<link>` in `<head>`. `next/font` eliminates layout shift.
- Always provide `alt` text on images.
- Use `priority` prop on above-the-fold hero images.

---

## 10. Testing

### Unit tests (components)

```typescript
import { render, screen } from "@testing-library/react";
import { UserCard } from "./UserCard";

describe("UserCard", () => {
  it("renders user name", () => {
    render(<UserCard name="Alice" email="alice@example.com" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
```

### Server Component tests

Server Components are async functions — test them by calling directly:

```typescript
import UserPage from "./page";

// Mock the data fetching
jest.mock("@/lib/data", () => ({
  getUser: jest.fn().mockResolvedValue({ name: "Alice" }),
}));

it("renders user page", async () => {
  const result = await UserPage({ params: { id: "1" } });
  // Assert on the returned JSX structure
});
```

### Server Action tests

```typescript
import { createUser } from "@/actions/users";

it("validates required fields", async () => {
  const formData = new FormData();
  // missing required fields
  const result = await createUser(formData);
  expect(result.error).toBeDefined();
});
```

### E2E tests (Playwright or Cypress)

```typescript
test("user can navigate to dashboard", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Dashboard");
  await expect(page).toHaveURL("/dashboard");
  await expect(page.locator("h1")).toHaveText("Dashboard");
});
```

### Test rules

- Every new page: at least one render test (loads without error).
- Every Server Action: validation test (malformed input rejected) + happy path.
- Every Route Handler: status code + response shape assertions.
- Mock external dependencies, never the component itself.
- No snapshot tests for styled components (too brittle).

---

## 11. Performance Rules

- **Minimize `"use client"`**: Push interactivity to leaf components.
- **Use Suspense boundaries**: Wrap async components for streaming.
- **Avoid waterfalls**: Fetch data in parallel with `Promise.all()`.
- **Use `loading.tsx`**: Every page with async data should have one.
- **Prefetch links**: `<Link>` prefetches by default. Don't disable without reason.
- **Dynamic imports**: Use `next/dynamic` for heavy client components not needed on initial load.

```typescript
import dynamic from "next/dynamic";
const HeavyChart = dynamic(() => import("./HeavyChart"), {
  loading: () => <ChartSkeleton />,
});
```

---

## 12. Environment Variables

| Prefix | Available in | Use for |
|---|---|---|
| `NEXT_PUBLIC_` | Client + Server | Public API URLs, feature flags |
| (no prefix) | Server only | Secrets, DB URLs, API keys |

Never access non-`NEXT_PUBLIC_` vars in Client Components. They will be `undefined` and may leak in build output.

---

## 13. TypeScript Conventions

- Enable `strict: true` in `tsconfig.json`.
- Type all component props explicitly (no `any`).
- Use `satisfies` for type-safe config objects.
- Prefer `interface` for component props, `type` for unions and intersections.
- Export types from `src/types/` for shared types.
