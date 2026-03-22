# Agent Guidelines for Super Printers OMS

This is a React + TypeScript + Supabase Order Management System for Super Printers, Chennai.

---

## Build / Lint / Test Commands

```bash
# Development
npm run dev              # Start Vite dev server

# Build
npm run build            # Production build
npm run build:dev        # Dev build (with source maps)

# Linting
npm run lint             # Run ESLint on all files

# Testing
npm run test             # Run all tests once (Vitest)
npm run test:watch       # Watch mode for tests
npm run test <file>      # Run single test file (e.g., npm test src/utils/format.test.ts)
npm run test:watch <file> # Watch single test file

# Other
npm run preview          # Preview production build
npm run seed             # Seed dummy data (requires .env with Supabase vars)
npm run test:edge-functions # Test Supabase edge functions locally
```

**Environment variables** (for local dev): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`  
**Runtime**: Bun is preferred (`bun >= 1.0.0`), but npm works too.

---

## TypeScript

- Use strict typing. Avoid `any` (ESLint warns against it).
- Import Supabase-generated types: `import type { Tables, TablesInsert } from "@/integrations/supabase/types";`
- Define custom types near their usage (e.g., `Order = Tables<"orders">` in `useOrders.ts`).
- Use TypeScript's `type` keyword for type aliases, `interface` for object shapes.
- Null checks: prefer `?.` and `??` over verbose conditionals.

---

## Imports & Path Aliases

- Use the `@/` alias for all imports from `src/` (configured in `tsconfig.json`).
- Order imports: 1) React/framework, 2) External libraries, 3) Internal modules.
- Use `import { foo } from "bar"` (named) over default imports where possible.

```typescript
// Correct
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Avoid
import React, { useState } from "react"; // React 18 doesn't need explicit React import
```

---

## React Patterns

### Hooks
- All data fetching via **TanStack React Query v5** (`@tanstack/react-query`).
- Wrap queries in custom hooks in `src/hooks/` (e.g., `useOrders`, `useCustomers`).
- Mutations should use `useMutation` with `onSuccess` and `onError` callbacks.
- Always invalidate relevant query keys after mutations.
- Show toast notifications (`sonner`) on mutation success/error.

### Real-time Updates
- Subscribe to Supabase realtime channels for live updates (see `useOrders.ts`).
- Use `useEffect` to set up subscriptions, clean up with `supabase.removeChannel()`.
- Invalidate query keys inside the subscription callback.

### Forms
- Use **React Hook Form + Zod** for form validation.
- Never use uncontrolled inputs for data that needs validation.

---

## Component Conventions

- Use **shadcn/ui** components from `src/components/ui/`. Don't recreate existing components.
- Use `cn()` from `@/lib/utils` for conditional className merging (clsx + tailwind-merge).
- Use `class-variance-authority` (CVA) for component variants.
- Prefer **Tailwind CSS** for styling. Add custom colors to `tailwind.config.ts`.
- Keep components focused. Extract logic to hooks or utils.
- Error boundaries wrap routes (see `RouteErrorBoundary` in `App.tsx`).

---

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `order-history.tsx`, `use-orders.ts` |
| Components | PascalCase | `OrderDetail.tsx`, `StatusBadge.tsx` |
| Hooks | camelCase, prefix `use` | `useOrders.ts`, `useCreateOrder` |
| Types/Interfaces | PascalCase | `Order`, `CustomerInsert` |
| Constants | SCREAMING_SNAKE or Pascal | `ORDER_STATUSES`, `STATUS_COLORS` |
| CSS classes | kebab-case (Tailwind) | `bg-blue-500`, `text-gray-700` |

---

## State Management

- **Server state**: TanStack React Query (all API calls).
- **UI state**: React `useState`/`useReducer`, or React context for global UI state.
- **URL state**: React Router for page/route state (`useParams`, `useSearchParams`).
- Avoid `localStorage`/`sessionStorage` for critical data (except theme preference).

---

## Supabase Integration

- Supabase client: `src/integrations/supabase/client.ts`.
- Types auto-generated from DB schema in `src/integrations/supabase/types.ts`.
- Use `.select("*")` with `.single()` for single-row responses.
- Handle errors with `if (error) throw error;` pattern.
- Use RPC for complex operations: `supabase.rpc("function_name", args)`.
- Database functions: `generate_order_no`, `generate_job_number`.
- All mutations should call `logAudit()` from `@/utils/auditLog` for audit trails.

---

## Error Handling

- **Supabase errors**: Throw and let React Query handle, with toast in `onError`.
- **User-facing errors**: Use `sonner` toasts (`toast.success()`, `toast.error()`).
- **DB migration errors**: Check for "schema cache", "does not exist", "relation" — use `friendlyDbError()` from `utils.ts`.
- **Form errors**: Display inline under fields using Zod validation.

---

## File Structure

```
src/
├── components/
│   ├── ui/          # shadcn/ui components (Button, Dialog, etc.)
│   ├── layout/      # AppLayout, Sidebar, MobileBottomNav
│   └── *.tsx        # Shared components
├── pages/           # Route-level page components
├── hooks/           # React Query hooks
├── lib/             # Constants, utilities (utils.ts, constants.ts)
├── integrations/    # Supabase client and types
├── contexts/        # React contexts (AuthContext)
├── utils/           # Helper functions (auditLog, etc.)
└── App.tsx          # Router and providers
```

---

## Database Migrations

- All migrations in `supabase/migrations/`. They run automatically on push to `main` via GitHub Actions.
- Never run SQL manually in Supabase dashboard.
- After adding tables, run `npm run seed` to populate test data.

---

## Edge Functions

- Located in `supabase/functions/`.
- `parse-po`: Parses purchase order PDFs (requires `LOVABLE_API_KEY` secret).
- `parse-document`: General document parsing.
- Test locally: `npm run test:edge-functions`.

---

## Additional Notes

- **No comments**: Don't add comments unless explicitly asked.
- **No emojis in code**: Use emoji in UI strings only.
- **Dark mode**: Use `next-themes` ThemeProvider.
- **Dates**: Use `date-fns` for all date manipulation.
- **PDF/OCR**: Use `pdfjs-dist` for PDFs, `tesseract.js` for OCR (bank statements).
- **Excel**: Use `xlsx` library for import/export.
