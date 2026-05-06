# Component Design — Next.js Patterns

> Use this file when designing component architecture, choosing Server vs Client Components,
> building reusable UI, handling forms, or managing state in a Next.js App Router project.

---

## 1. Component taxonomy

| Type | `"use client"`? | Data access | Interactivity | Example |
|---|---|---|---|---|
| Server Component (default) | No | Direct DB, fetch, secrets | None | Page, Layout, data display |
| Client Component | Yes | Props only (no secrets) | Full (state, effects, events) | Forms, modals, charts, dropdowns |
| Shared/Presentational | Either | Props only | Optional | Button, Card, Badge |

### Decision flowchart

```
Does this component need useState, useEffect, event handlers, or browser APIs?
  YES -> Client Component ("use client")
  NO  -> Server Component (default)

Does this component only render props with no side effects?
  YES -> Shared Component (no directive, works in both contexts)
```

---

## 2. Composition patterns

### Pattern: Server parent, client leaf

The most common and preferred pattern. Server Component fetches data and renders layout; Client Component handles interactivity at the leaf.

```typescript
// Server Component — src/app/products/page.tsx
import { getProducts } from "@/lib/data";
import { ProductFilter } from "@/components/features/ProductFilter";
import { ProductCard } from "@/components/ui/ProductCard";

export default async function ProductsPage() {
  const products = await getProducts();
  return (
    <div>
      <h1>Products</h1>
      <ProductFilter /> {/* Client: handles filter state */}
      <div className="grid grid-cols-3 gap-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} /> {/* Shared: just renders props */}
        ))}
      </div>
    </div>
  );
}
```

### Pattern: Client wrapper with server children

When a Client Component needs to wrap Server Components (e.g., a collapsible panel):

```typescript
// Client Component
"use client";
import { useState } from "react";

export function CollapsiblePanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(!open)}>Toggle</button>
      {open && children} {/* Server Component children render on server */}
    </div>
  );
}

// Usage in Server Component
<CollapsiblePanel>
  <ServerDataComponent /> {/* This still renders on the server */}
</CollapsiblePanel>
```

### Pattern: Extracting client islands

When a mostly-static component needs one interactive part, extract just that part:

```typescript
// Server Component (stays on server)
import { LikeButton } from "./LikeButton"; // tiny client component

export function ArticleCard({ article }) {
  return (
    <div>
      <h2>{article.title}</h2>
      <p>{article.excerpt}</p>
      <LikeButton articleId={article.id} initialCount={article.likes} />
    </div>
  );
}
```

---

## 3. Form patterns

### Server Action form (preferred for mutations)

```typescript
// src/actions/contact.ts
"use server";
import { z } from "zod";

const ContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  message: z.string().min(10, "Message too short"),
});

type ContactState = {
  errors?: Record<string, string[]>;
  success?: boolean;
};

export async function submitContact(
  prevState: ContactState | null,
  formData: FormData
): Promise<ContactState> {
  const parsed = ContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  // Process submission
  return { success: true };
}
```

```typescript
// src/components/features/ContactForm.tsx
"use client";
import { useActionState } from "react";
import { submitContact } from "@/actions/contact";

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, null);

  if (state?.success) {
    return <p>Thank you for your message!</p>;
  }

  return (
    <form action={action}>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required />
        {state?.errors?.name && <p className="text-red-500">{state.errors.name[0]}</p>}
      </div>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        {state?.errors?.email && <p className="text-red-500">{state.errors.email[0]}</p>}
      </div>
      <div>
        <label htmlFor="message">Message</label>
        <textarea id="message" name="message" required />
        {state?.errors?.message && <p className="text-red-500">{state.errors.message[0]}</p>}
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
```

### Optimistic updates

```typescript
"use client";
import { useOptimistic } from "react";
import { toggleLike } from "@/actions/likes";

export function LikeButton({ initialLiked, articleId }) {
  const [optimisticLiked, setOptimisticLiked] = useOptimistic(initialLiked);

  async function handleLike() {
    setOptimisticLiked(!optimisticLiked);
    await toggleLike(articleId);
  }

  return (
    <form action={handleLike}>
      <button>{optimisticLiked ? "Unlike" : "Like"}</button>
    </form>
  );
}
```

---

## 4. State management

### Hierarchy (prefer simpler options first)

| Scope | Solution | When |
|---|---|---|
| Component-local | `useState` / `useReducer` | Toggle, form input, modal open/close |
| URL state | `useSearchParams` / `usePathname` | Filters, pagination, tabs (shareable) |
| Cross-component | React Context (in Client Components) | Theme, auth user, sidebar state |
| Server state | Server Components + `revalidatePath()` | Most data that comes from DB/API |
| Complex client state | Zustand or Jotai | Large interactive apps (dashboards, editors) |

### URL-as-state (preferred for filters/pagination)

```typescript
"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export function ProductFilter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={searchParams.get("category") ?? "all"}
      onChange={(e) => setFilter("category", e.target.value)}
    >
      <option value="all">All</option>
      <option value="electronics">Electronics</option>
    </select>
  );
}
```

This is preferred over React state for filters because: it survives page refresh, is shareable via URL, and triggers server-side rendering with the new params.

---

## 5. Loading and streaming patterns

### Suspense with loading.tsx

```
app/
  dashboard/
    page.tsx       # async Server Component
    loading.tsx    # shown while page.tsx resolves
```

### Granular streaming

```typescript
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<MetricsSkeleton />}>
        <Metrics /> {/* Async, streams in when ready */}
      </Suspense>
      <Suspense fallback={<ActivitySkeleton />}>
        <RecentActivity /> {/* Streams independently */}
      </Suspense>
    </div>
  );
}
```

### Skeleton components

Every `<Suspense>` boundary should have a purpose-built skeleton, not a generic spinner. Match the layout of the loaded content.

---

## 6. Error boundary patterns

### Per-segment error handling

```
app/
  dashboard/
    page.tsx
    error.tsx        # Catches errors in dashboard page
    settings/
      page.tsx
      error.tsx      # Catches errors only in settings
```

### Retry pattern

```typescript
"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-4 border border-red-200 rounded">
      <h2>Failed to load this section</h2>
      <p className="text-gray-600">{error.message}</p>
      <button onClick={reset} className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">
        Retry
      </button>
    </div>
  );
}
```

---

## 7. Shared component rules

Components in `src/components/ui/` should:

- Accept standard HTML attributes via `React.ComponentPropsWithoutRef<"element">`
- Use `forwardRef` when wrapping native elements
- Be agnostic to Server/Client context (no hooks, no `"use client"` unless required)
- Support className merging (use `cn()` utility with `clsx` + `tailwind-merge`)
- Have TypeScript props interface exported

```typescript
// src/components/ui/Button.tsx
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "rounded font-medium transition-colors",
          variant === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
          variant === "secondary" && "bg-gray-200 text-gray-900 hover:bg-gray-300",
          variant === "ghost" && "hover:bg-gray-100",
          size === "sm" && "px-3 py-1.5 text-sm",
          size === "md" && "px-4 py-2",
          size === "lg" && "px-6 py-3 text-lg",
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
```
