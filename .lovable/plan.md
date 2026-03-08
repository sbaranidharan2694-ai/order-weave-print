

## Plan: Ensure All Bank Analyser Data Is Fully Database-Backed

### Current State
- **Statements & transactions**: Already stored in Supabase database and loading correctly across browsers (verified: 7 statements, 261 transactions).
- **PDFs**: The code tries to save to a `bank-pdfs` Supabase Storage bucket, but **no bucket exists**. Uploads silently fail, so PDFs are lost.
- **UI messaging**: Footer says "PDFs stay on this device only" and a `SharedDataBanner` warns about local-only data — both are misleading since the DB path works fine.

### Changes

**1. Create `bank-pdfs` Storage Bucket (Database Migration)**
- Create a public storage bucket `bank-pdfs` so PDF files are persisted in Supabase Storage, retrievable from any browser.
- Add a storage policy allowing all authenticated/anon access (matching the pattern of other tables with open RLS).

**2. Clean Up Misleading UI Messaging**
- Remove the `SharedDataBanner` from `BankAnalyser.tsx` (data IS in the database).
- Remove `useStorageMode` hook usage from Bank Analyser.
- Update footer text to confirm data is stored in the cloud, not locally.
- Remove the "PDFs stay on this device only" note.

**3. Remove localStorage Migration Code**
- Remove the `migrateOldData()` function call from `refreshData`. The migration from localStorage is a legacy path that's no longer needed and adds unnecessary startup delay.

**4. Files Changed**
- `src/pages/BankAnalyser.tsx` — Remove `SharedDataBanner`, `useStorageMode`, `migrateOldData`, update footer text
- Storage bucket creation via migration tool

