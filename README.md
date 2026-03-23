# Super Printers OMS — Lovable

This project is built and deployed **only on [Lovable](https://lovable.dev)**. All configuration and deployment steps assume Lovable.

**URL**: https://lovable.dev/projects/superprintersoms

## Running on Lovable

1. **Connect Supabase**  
   In Lovable: **Project → Settings → Integrations → Supabase** → **Connect Supabase** and link your project. Lovable injects `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time; no env vars to copy.

2. **Build & deploy**  
   Lovable runs `npm run build` and serves the app. Deploy via **Share → Publish**.

3. **Data in Supabase**  
   Bank Analyser, Attendance, and Payroll store everything in Supabase (no browser storage). Add the **GitHub Actions** secrets (see below) so migrations run on push; then all users see the same data.

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://superprintersoms.lovable.app/) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

Clone this repo, make changes, and push. Pushed changes sync to Lovable. For local dev you need Node.js and npm; use the same env var names Lovable uses (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) in a `.env` file if you want to run `npm run dev` locally.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://superprintersoms.lovable.app/) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## Automatic migrations — no SQL to run

All database migrations run **automatically** when you push to GitHub. You never need to run SQL manually in Supabase.

**One-time setup (do this once per repo)**

1. **Supabase Access Token**  
   [Supabase → Account → Access Tokens](https://supabase.com/dashboard/account/tokens): create a token and copy it.

2. **Project ref**  
   In your Supabase project: **Settings → General** → copy the **Reference ID**.

3. **GitHub secrets**  
   In your GitHub repo: **Settings → Secrets and variables → Actions** → add:
   - `SUPABASE_ACCESS_TOKEN` = the token from step 1  
   - `SUPABASE_PROJECT_REF` = the Reference ID from step 2  

**After that: just push to GitHub**

- Push your code to the **`main`** (or **`master`**) branch.
- The workflow **Supabase migrations** runs and applies **all** pending migrations in `supabase/migrations/` in order (Bank Analyser, Attendance, Payroll, etc.).
- No SQL to run yourself — the workflow does `supabase db push` for you.
- Check **Actions** in GitHub to see the run and any errors.

**If you push from another branch**  
   Merge into `main` so the workflow runs, or run it manually: **Actions → Supabase migrations → Run workflow**.

**Seed dummy data (optional)**  
   After migrations exist, you can insert sample data for Bank Analyser and Attendance:  
   `npm run seed`  
   (Requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. If tables are missing, the script prints a message to run migrations first.)

---

## Import and deploy on Lovable

1. **Import the repo**  
   In Lovable: connect GitHub and import this repository.

2. **Connect Supabase**  
   In Lovable: **Project → Settings → Integrations → Supabase** → **Connect Supabase**. Lovable injects the required env vars at build time.

3. **Migrations**  
   In **GitHub**: **Settings → Secrets and variables → Actions** → add `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. Push to `main` (or run the workflow) so migrations run.

4. **Deploy**  
   In Lovable: **Share → Publish**. The app is built and served by Lovable; no other deployment platform is used.

---

## If the live site doesn't update after pushing to GitHub

GitHub has the latest code; Lovable must **pull** it and **rebuild**. Do this:

1. **Confirm repo link**  
   In Lovable, ensure the project is linked to **this** repo: `sbaranidharan2694-ai/superprintersoms` (branch: `main`).

2. **Pull / sync from GitHub**  
   In Lovable’s project, use **Sync from GitHub**, **Pull**, or **Import from GitHub** (or the equivalent in your Lovable UI) so Lovable’s copy of the code matches GitHub’s `main` branch.

3. **Redeploy**  
   Use **Share → Publish** (or **Deploy** / **Redeploy**) so Lovable builds and deploys the updated code.

4. **Verify**  
   Open the live URL (e.g. `https://superprintersoms.lovable.app`), do a **hard refresh** (Ctrl+Shift+R or Cmd+Shift+R). The header should show a small build date (e.g. **2025-03-07**) when the latest deploy is active.

---

## Import PO — why PO might not import

If **Upload & Parse PO** or **Import as N Order(s)** fails, check:

1. **PDF parsing (AI)**  
   - Supabase **Edge Function** `parse-po` must be deployed and the function must have **LOVABLE_API_KEY** set (Lovable AI gateway).  
   - If you see “AI parsing returned no data” or a function error, deploy the edge function and set the secret in Supabase → Edge Functions → parse-po → Secrets.

2. **Saving Purchase Order / Line items**  
   - Tables `purchase_orders` and `purchase_order_line_items` must exist (run migrations).  
   - The app shows a clear toast if saving the PO or line items fails (e.g. missing columns or RLS).

3. **Creating orders**  
   - The **RPC** `generate_order_no` must exist in Supabase (migrations).  
   - Table `orders` must exist with the expected columns.  
   - If creation fails, the toast will say “Failed to create orders” and mention `generate_order_no` / orders table.

Use **Manual PO Entry** if PDF parsing is not available; it creates orders without the parse-po edge function.

---

## Bank Analyser — statements and transactions

- All data is in Supabase: **bank_statements**, **bank_transactions**, **bank_custom_lookup**, and the **bank-pdfs** storage bucket.  
- Migrations: see `supabase/migrations/README_BANK_ANALYSER.md`; run migrations (e.g. via GitHub Actions) so these tables and the bucket exist.  
- If statements or transactions don’t show: confirm the migrations ran, then refresh the Bank Analyser page; check Supabase → Table Editor for `bank_statements` and `bank_transactions`.  
- **Max rows**: if you have many transactions, ensure Supabase **Settings → API** “Max Rows” is high enough (e.g. 2000); the app requests up to 2000 transactions per account.
