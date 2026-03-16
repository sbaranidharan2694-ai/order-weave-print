

# Plan: Fix Build Errors + Multi-Line Item Orders + Expense Tracker

## Part 1: Fix 4 Build Errors (Blocking)

### Error 1 & 2: `generate_job_number` not in types
`useProductionJobs.ts` lines 87 and 116 call `supabase.rpc("generate_job_number")` but `types.ts` Functions only lists `generate_order_no`. The function exists in the DB but the types file wasn't regenerated.

**Fix**: Create a migration that re-creates `generate_job_number()` (idempotent with `CREATE OR REPLACE`). This will trigger types regeneration adding it to the Functions map.

### Error 3 & 4: `string` not assignable to `JobStatus` union
`JOB_STATUSES.indexOf(job.status)` — `JOB_STATUSES` is `readonly ["design_review", ...]` so `.indexOf()` expects that union type, but `job.status` is `string` from the DB types.

**Fix**: Cast with `JOB_STATUSES.indexOf(job.status as JobStatus)` in both `OrderDetail.tsx` (line 865) and `ProductionJobs.tsx` (line 200).

---

## Part 2: Multi-Line Item New Order Form

### Current state
- `order_items` table already exists with columns: `id, order_id, item_no, description, quantity, unit_price, amount`
- `useOrderItems` and `useAddOrderItems` hooks already exist
- `useCreateOrder` currently creates ONE order_item from the order's single product_type/quantity/amount
- NewOrder form has single product_type, quantity, size, paper_type, amount fields

### Changes

**NewOrder.tsx** — Replace the single "Order Details" card with a dynamic line items section:
- Add state: `lineItems: Array<{description, quantity, unit_price, gst_rate, amount}>` starting with 1 row
- Each row: Description (text), Qty (number), Unit Price ₹ (number), Tax % (select: 0/5/12/18/28), Line Total (auto-calc, read-only)
- "+ Add Item" button appends empty row; trash icon removes rows (min 1)
- Auto-calculate: `lineTotal = qty * unit_price * (1 + gst_rate/100)`
- Show running subtotal + tax + grand total at bottom
- Keep product_type as an optional "primary product" field for backward compat
- On submit: pass line items array; `useCreateOrder` inserts all into `order_items` and creates production jobs per item

**useOrders.ts** (`useCreateOrder`) — Modify to accept optional `lineItems` array:
- If lineItems provided: insert all into `order_items`, create production job per item
- Set order `quantity` = sum of line item quantities, `amount` = sum of line totals
- Set `qty_ordered` and `qty_pending` correctly

**order_items table** — No schema change needed. Already has description, quantity, unit_price, amount.

---

## Part 3: Expense Tracker Module

### Database
Create `expenses` table:
- `id` uuid PK, `expense_date` date, `category` text, `description` text, `amount` numeric(12,2), `payment_method` text (Cash/UPI/Bank/Card), `created_at` timestamptz, `updated_at` timestamptz
- RLS: permissive `USING(true) WITH CHECK(true)` for all

### New files
- **`src/hooks/useExpenses.ts`** — CRUD hooks: `useExpenses(filters)`, `useCreateExpense`, `useUpdateExpense`, `useDeleteExpense`, `useExpenseStats`
- **`src/pages/Expenses.tsx`** — Full page with:
  - Stats cards: Today / This Week / This Month totals
  - Category breakdown (simple bar or list)
  - Expense entry form (dialog/inline)
  - Filterable table with edit/delete actions
  - Date filter

### Navigation
- Add "Expenses" to `AppSidebar.tsx` under FINANCE group (with `IndianRupee` icon)
- Add route `/expenses` in `App.tsx`
- Add to `MobileBottomNav.tsx`

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/...` | Re-declare `generate_job_number` + create `expenses` table |
| `src/pages/OrderDetail.tsx` | Cast `job.status as JobStatus` |
| `src/pages/ProductionJobs.tsx` | Cast `job.status as JobStatus` |
| `src/pages/NewOrder.tsx` | Multi-line item UI with add/remove rows |
| `src/hooks/useOrders.ts` | Accept lineItems in createOrder |
| `src/hooks/useExpenses.ts` | New — CRUD hooks |
| `src/pages/Expenses.tsx` | New — expense tracker page |
| `src/components/layout/AppSidebar.tsx` | Add Expenses nav item |
| `src/components/layout/MobileBottomNav.tsx` | Add Expenses tab |
| `src/App.tsx` | Add /expenses route |

