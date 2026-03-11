

# Plan: Fulfillment Tracker Fix + Universal PO Parser + Auto-Learning System

## Analysis Summary

### Fulfillment Tracker Bug (Section 1)
**Root cause**: In `OrderDetail.tsx` line 98, `qtyOrdered` uses `Number(order.qty_ordered) || order.quantity`. The `||` operator means if `qty_ordered` is `0` or `null` (common for manually created orders), it falls back to `order.quantity`. But the real bug is in `recalcFulfillment()` in `useFulfillments.ts` line 97: `(order as any)?.qty_ordered || (order as any)?.quantity || 0` — the same `||` fallback. When an order is created via Import PO (line 696), `quantity` is set to `totalQty` but `qty_ordered` is NOT set, so it stays null. The `recalcFulfillment` reads `qty_ordered` (null) → falls back to `quantity` — but `quantity` is a sum of all line items while the order was created with that value, so "99 vs 100" is likely a rounding/off-by-one in the sum calculation or an integer truncation issue with `parseInt` vs `Number`.

**Fix**: Ensure `qty_ordered` is always set equal to `quantity` at order creation time in Import PO. In `recalcFulfillment`, use `order.quantity` as the canonical source. In `OrderDetail.tsx`, derive all fulfillment values from `order.quantity` and live fulfillment records, not from stored `qty_ordered`.

### PO Parser (Sections 2-5)
The edge function (`parse-po`) and rule-based fallback (`parsePOText.ts`) already exist and work. The request is to add a synonym dictionary + regex layer + heuristic fallback to `parsePOText.ts` to make it more universal.

### Auto-Learning Parser (Sections 6-10)
New `po_parse_patterns` table + document signature detection + stored mappings reuse.

---

## Implementation Plan

### 1. Fix Fulfillment Tracker Logic
**Files**: `src/hooks/useFulfillments.ts`, `src/pages/OrderDetail.tsx`, `src/pages/ImportPO.tsx`

- **`useFulfillments.ts` → `recalcFulfillment()`**:
  - Read `quantity` (not `qty_ordered`) as the canonical ordered value
  - Add validation: `if (totalFulfilled > qtyOrdered) throw "Delivered exceeds ordered"`
  - Clamp: `fulfilled = Math.min(totalFulfilled, qtyOrdered)`; `pending = Math.max(0, qtyOrdered - fulfilled)`
  - Also set `qty_ordered = quantity` in the update to keep them in sync

- **`OrderDetail.tsx`**:
  - Line 98: Change to `const qtyOrdered = order.quantity` (canonical source)
  - Line 100: `const qtyPending = Math.max(0, qtyOrdered - qtyFulfilled)`
  - Line 166: Validate `qty > (qtyOrdered - qtyFulfilled)` instead of `qty > qtyPending` (same but clearer)

- **`ImportPO.tsx`** (order creation ~line 689):
  - Add `qty_ordered: totalQty` and `qty_pending: totalQty` alongside `quantity: totalQty`

### 2. Universal PO Parser Engine
**File**: `src/utils/parsePOText.ts` (rewrite/enhance)

- Add `FIELD_SYNONYMS` dictionary for po_number, customer, quantity, product, delivery_date, amount
- Add text normalization layer (lowercase, trim, normalize punctuation)
- Add flexible field matching using `synonyms.some(s => normalized.includes(s))`
- Add regex value extraction patterns for PO number, quantity, currency, date
- Add heuristic fallback: find largest alphanumeric near "po", largest integer near "qty", etc.
- Ensure the parser never returns empty — always returns best-effort structured output
- Add `confidence` scoring and `warnings` array

### 3. Auto-Learning PO Parser (New Feature)
**New files & changes**:

- **Database migration**: Create `po_parse_patterns` table with columns: id, customer_name, document_signature, field_label, mapped_field, confidence_score, times_used, created_at, updated_at
- **New utility**: `src/utils/poPatternLearning.ts`
  - `generateDocSignature(text)`: hash first 10 lines + header labels
  - `lookupPatterns(signature)`: query `po_parse_patterns` for existing mappings
  - `applyLearnedMappings(text, patterns)`: apply stored label→field mappings
  - `learnFromParse(text, parsedResult, customerName)`: store new mappings with confidence 0.7
  - `incrementConfidence(patternIds)`: bump confidence on successful reuse
  - Validation: only store if po_number and at least 1 line item detected
- **Integration in `ImportPO.tsx`**:
  - Before AI call: check for learned patterns → if found with high confidence, apply directly
  - After successful parse: call `learnFromParse()` to store new mappings
  - Add small debug panel (collapsible) showing known formats and confidence scores

### 4. Debug Logging
- Add `console.log` statements in parser and fulfillment code for field detection, fallback usage, qty values
- No UI debug panel beyond the auto-learning one (keep it simple)

### 5. UI Synchronization
- Already handled by React Query invalidation in `useFulfillments.ts`
- Verify `qc.invalidateQueries` covers all relevant keys after fulfillment CRUD

---

## Files Modified
| File | Change |
|------|--------|
| `src/hooks/useFulfillments.ts` | Fix `recalcFulfillment` to use `quantity`, add validation |
| `src/pages/OrderDetail.tsx` | Fix `qtyOrdered` derivation, use `order.quantity` |
| `src/pages/ImportPO.tsx` | Add `qty_ordered` to order insert, integrate pattern learning |
| `src/utils/parsePOText.ts` | Add synonym dictionary, regex extraction, heuristic fallback |
| `src/utils/poPatternLearning.ts` | New file — auto-learning system |
| `supabase/migrations/...` | New table `po_parse_patterns` |

