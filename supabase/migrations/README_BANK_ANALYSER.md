# Bank Analyser – permanent storage (database + storage)

All Bank Analyser data is stored in Supabase only (no browser localStorage). Tables and the PDF bucket are created **automatically** when the GitHub Actions workflow runs (see main README: **"Automatic migrations on deploy (Lovable)"**).

**Tables (migration `20250307000000_create_bank_analyser_tables.sql`):**

- `bank_statements` – one row per uploaded statement (metadata).
- `bank_transactions` – parsed transactions linked to statements.
- `bank_custom_lookup` – party-name mappings.

**Storage (migration `20250307200000_bank_pdfs_storage_bucket.sql`):**

- Bucket `bank-pdfs` – PDF files (one file per statement, up to 50 MB each).

If you do not run these migrations, Bank Analyser will show an empty state and a banner asking you to run migrations. Nothing is stored in the browser.
