# Next.js Reviewer Checklist (Condensed)

> Extracted from LLD.md + SKILL.md universal defaults. This is the reviewer's working reference for Next.js code.

## Severity Rules

- **blocker**: Code is broken, leaks secrets, or violates a hard rule. Auto-reject.
  - Secrets in client code, `"use client"` with direct DB access, missing error boundary on async page, no validation on server action input, raw user input rendered without sanitization

- **major**: Violates a principle but works. Reject if 2+ majors.
  - Unnecessary `"use client"` on data-display component, data fetching in useEffect instead of Server Component, missing loading.tsx for async page, fat component (>200 lines), missing revalidation after mutation

- **minor**: Style, naming, missing alt text on non-critical image. Report but don't block.

## Checklist

### Server/Client Boundary
- [ ] Only components that need interactivity have `"use client"`
- [ ] No secrets or server-only imports in Client Components
- [ ] Props crossing server-to-client boundary are serializable (no functions, classes)
- [ ] `"use client"` pushed to leaf components, not wrapper/parent
- [ ] Server Components do NOT use useState, useEffect, or event handlers

### Data Fetching
- [ ] Data fetched in Server Components, not via useEffect in Client Components
- [ ] Parallel fetches use `Promise.all()`, no waterfalls
- [ ] Appropriate cache strategy: `revalidate`, `no-store`, or tags
- [ ] `revalidatePath()` or `revalidateTag()` called after mutations
- [ ] No direct DB calls in Client Components

### Route Handlers & Server Actions
- [ ] All input validated (zod or equivalent) before processing
- [ ] Server Actions marked with `"use server"`
- [ ] Error responses include machine-readable error code
- [ ] Route handlers handle all error paths (try/catch, validation)
- [ ] Form submissions use `useActionState` for pending/error state

### Error Handling
- [ ] Async pages have corresponding `error.tsx` boundary
- [ ] `error.tsx` files have `"use client"` directive
- [ ] `notFound()` called for missing resources (not manual 404 rendering)
- [ ] `loading.tsx` exists for pages with async data fetching

### Performance
- [ ] Images use `next/image` (not raw `<img>`)
- [ ] Fonts use `next/font` (not `<link>` in head)
- [ ] Heavy client components use `next/dynamic` for code splitting
- [ ] No unnecessary re-renders (stable references, proper memoization)
- [ ] Suspense boundaries wrap independent async sections

### TypeScript & Hygiene
- [ ] All component props explicitly typed (no `any`)
- [ ] No `@ts-ignore` without justifying comment
- [ ] No `console.log` in production paths
- [ ] No commented-out code
- [ ] Proper use of `Metadata` export for SEO

### Tests
- [ ] Every new page: render test (loads without error)
- [ ] Every new Server Action: validation test + happy path
- [ ] Every new Route Handler: status code + response shape
- [ ] No snapshot tests for styled components
- [ ] Mocks target dependencies, not the component itself

### Accessibility
- [ ] All images have meaningful `alt` text
- [ ] Interactive elements are keyboard accessible
- [ ] Form inputs have associated labels
- [ ] Color is not the only indicator of state

## Audit-Mode Extensions

When invoked with `mode: audit`, also check:
- [ ] Cross-component dependency hygiene (no circular imports, no reaching into feature boundaries)
- [ ] Dead code: unused exports, unreachable pages, orphaned components
- [ ] Test coverage completeness (not just new tests -- all pages and actions)
- [ ] Bundle size concerns: large client-side dependencies, missing code splitting
- [ ] Return expanded JSON with: `"cross_module_concerns": [...]`, `"test_coverage_gaps": [...]`, `"bundle_concerns": [...]`
