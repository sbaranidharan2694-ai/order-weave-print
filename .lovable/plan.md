

## Plan: Fix Admin Login and Add Forgot Password

### 1. Create Admin User via Edge Function
There is no `profiles` table in the database, and the app doesn't use one — it relies solely on `auth.users`. I will create a temporary edge function (`setup-admin`) that uses the Supabase Admin API (`supabase.auth.admin.createUser`) to create the admin user with:
- Email: `admin@superprinters.com`
- Password: `Admin@SuperPrint2026`
- `email_confirm: true` (auto-verified)

No profiles table will be created since the app has no need for one — all 17 tables use simple `auth.uid() IS NOT NULL` RLS policies with no user-specific data scoping.

After confirming the user is created, the edge function will be deleted.

### 2. Update Login Page
Modify `src/pages/Login.tsx`:
- **Remove** the static "Contact your administrator for account access." text
- **Add** a "Forgot Password?" link that calls `supabase.auth.resetPasswordForEmail()` with `redirectTo` pointing to `/reset-password`
- **Change** password field `autoComplete` from `"current-password"` to `"off"`
- Add a toggle state for showing the forgot password form (email-only input + send reset link button)

### 3. Create Reset Password Page
Create `src/pages/ResetPassword.tsx`:
- Checks URL hash for `type=recovery`
- Shows a "Set New Password" form
- Calls `supabase.auth.updateUser({ password })` to update the password
- On success, redirects to `/` (dashboard)

### 4. Add Route for Reset Password
Update `src/App.tsx`:
- Add `/reset-password` as a **public route** (outside `AuthGate`, before the `BrowserRouter`) so unauthenticated users can access it

### 5. Test Login
Use browser tools to verify login works with the new credentials and redirects to the dashboard.

### Technical Notes
- No credentials are stored in frontend code
- Password lives only in Supabase Auth (`auth.users`)
- The setup edge function is a one-time bootstrap, deleted after use
- The reset password flow uses Supabase's built-in password recovery system

