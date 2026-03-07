# Attendance & Payroll – migrations

The **`attendance_uploads`** and **`payroll_employees`** tables are created **automatically** when the GitHub Actions workflow runs (see main README: **"Automatic migrations on deploy (Lovable)"**). No need to run SQL manually.

- **attendance_uploads** – stores uploaded attendance PDFs and parsed data.
- **payroll_employees** – stores employee code, name, and monthly salary for loss-of-pay calculation.

If you prefer to run by hand: run **`20250307100000_create_attendance_tables.sql`** and **`20250308100000_create_payroll_employees.sql`** in Supabase SQL Editor. Then use the **Attendance** tab to upload PDFs and the **Payroll Dashboard** sub-tab to set salaries and view net pay.

**PDF format:** Table-style sheets work best: one row per employee, columns for each day with P (Present), A (Absent), L (Leave), H (Half-day), etc. Digital (non-scanned) PDFs are required for text extraction.
