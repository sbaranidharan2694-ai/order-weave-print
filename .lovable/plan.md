

## Plan: Create User Account, Fix Security & Performance Issues

### What's Wrong

1. **Critical RLS Bug**: All 17 table policies were created as `RESTRICTIVE` instead of `PERMISSIVE`. In PostgreSQL, restrictive policies can only narrow access granted by a permissive policy. With zero permissive policies, **no rows are ever accessible** through the API. This is why the app may appear broken or require service_role bypass.

2. **Open Edge Function**: `parse-po` has `verify_jwt = false` in `config.toml`, allowing anyone on the internet to call it and consume AI credits.

3. **No user account exists** for the intended sole user.

---

### Implementation Steps

**Step 1 — Create the user account**
- Use the authentication system to create a user with email-based login for "santhosh". Since the app uses email/password auth, we'll create the account with an appropriate email (will confirm with user if needed) and password "Superprinters."
- Sign-ups are already disabled, so no one else can create accounts.

**Step 2 — Fix all RLS policies (database migration)**
- Drop all 17 existing RESTRICTIVE policies.
- Re-create them as PERMISSIVE (the PostgreSQL default) with the same `auth.uid() IS NOT NULL` check.
- Tables affected: `attendance_uploads`, `bank_custom_lookup`, `bank_statements`, `bank_transactions`, `customers`, `notification_logs`, `order_files`, `order_fulfillments`, `order_tags`, `orders`, `payroll_employees`, `product_types`, `purchase_order_line_items`, `purchase_orders`, `settings`, `status_logs`, `whatsapp_templates`.

**Step 3 — Secure parse-po edge function**
- Remove the `[functions.parse-po] verify_jwt = false` block from `supabase/config.toml`. The default (`verify_jwt = true`) will require a valid JWT, which the client already sends via `supabase.functions.invoke()`.
- Add a payload size guard in the function: reject `pdfText` over 200KB.

**Step 4 — Performance improvements**
- Add database indexes on frequently queried columns: `orders.status`, `orders.order_date`, `orders.customer_name`, `bank_transactions.statement_id`, `order_tags.order_id`, `order_fulfillments.order_id`, `status_logs.order_id`.
- These speed up dashboard aggregations, order filtering, and detail page loads.

---

### Clarification Needed

What email address should the "santhosh" account use? (e.g., `santhosh@superprinters.com` or another email)

