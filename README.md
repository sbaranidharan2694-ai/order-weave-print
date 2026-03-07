# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## Running on Lovable

When you **import this repo into Lovable** and run or deploy from there:

1. **Supabase (Lovable or manual)**  
   - **Lovable:** In Project Settings → Integrations → Supabase, click **Connect Supabase** and link your project. Lovable injects the URL and anon key automatically; you don’t need to copy a client ID or set env vars.  
   - **Manual / local:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`) in a `.env` file or in Lovable’s Environment variables. Get them from [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Settings → API**.  
   The app supports both Lovable’s automated injection and these env var names.

2. **Build & deploy**  
   Lovable uses `npm run build` and serves the output. No code changes needed.

3. **All data in the database (no browser storage)**  
   **Bank Analyser** and **Attendance** store everything in Supabase (tables + Storage bucket for PDFs). Nothing is kept in browser localStorage. Run the **automatic migrations** (see below) so the app can read/write; otherwise those pages show an empty state and a banner. Once migrations have run, all users see the same data and you can check results anytime from any device.

All features (OMS, Bank Analyser, Attendance, etc.) work the same when run from Lovable or locally.

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Configure environment variables.
# Copy .env.example to .env and set your Supabase credentials:
#   VITE_SUPABASE_URL=your-project-url
#   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
# Without these, the app will throw a clear error on load.

# Step 5: Start the development server with auto-reloading and an instant preview.
npm run dev
```

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

## Import this repo into Lovable

The code is built to work with Lovable. Use this flow:

1. **Import the repo**  
   In Lovable: connect your GitHub account and import this repository (or push the code to a repo Lovable can access, then import it).

2. **Connect Supabase**  
   In Lovable: **Project → Settings → Integrations → Supabase** → click **Connect Supabase** and link your Supabase project.  
   Lovable will inject `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or equivalent) at build time. You do **not** need to copy a client ID or create env vars manually if you use this integration.  
   If you prefer to set env vars yourself: **Project → Settings → Environment variables** and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`).

3. **Migrations (one-time per repo)**  
   In your **GitHub** repo: **Settings → Secrets and variables → Actions** → add:
   - `SUPABASE_ACCESS_TOKEN` (from Supabase → Account → Access Tokens)
   - `SUPABASE_PROJECT_REF` (from your Supabase project → Settings → General)  
   Then push to the `main` branch (or run **Actions → Supabase migrations → Run workflow**). All migrations (Bank, Attendance, Payroll) run automatically.

4. **Build and deploy**  
   In Lovable: **Share → Publish**. Lovable runs `npm run build` and serves the app. No code changes needed.

**Compatibility:** The app uses standard Vite + React, `import.meta.env` for config, and works with Lovable’s Supabase integration. PDF.js is loaded from a CDN. All data is stored in Supabase (no browser-only storage).
