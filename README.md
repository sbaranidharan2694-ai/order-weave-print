# Super Printers OMS — Lovable

This project is built and deployed **only on [Lovable](https://lovable.dev)**. All configuration and deployment steps assume Lovable.

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

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

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

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

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

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
