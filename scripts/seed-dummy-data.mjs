#!/usr/bin/env node
/**
 * Seed dummy data for Bank Analyser and Attendance.
 * Run from project root. Requires .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY).
 * Usage: node scripts/seed-dummy-data.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;

if (!url || !key || url.includes("placeholder")) {
  console.log("Skipping seed: Supabase not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env");
  process.exit(0);
}

const supabase = createClient(url, key);

async function seed() {
  console.log("Seeding dummy data...");

  const statementId = "seed-dummy-stmt-001";
  const txnId = "seed-dummy-txn-001";

  try {
    const { error: e1 } = await supabase.from("bank_statements").upsert(
      {
        id: statementId,
        account_key: "superprinters",
        file_name: "Dummy Statement.pdf",
        uploaded_at: new Date().toISOString(),
        period: "Feb 2026",
        period_start: "2026-02-01",
        period_end: "2026-02-28",
        account_number: "1234567890",
        opening_balance: 10000,
        closing_balance: 15000,
        total_credits: 20000,
        total_debits: 15000,
        transaction_count: 1,
        pdf_stored: false,
        pdf_file_size: 0,
        pdf_chunks: 0,
        last_validated: null,
      },
      { onConflict: "id" }
    );
    if (e1) throw e1;
    console.log("  ✓ bank_statements");

    const { error: e2 } = await supabase.from("bank_transactions").upsert(
      {
        id: txnId,
        statement_id: statementId,
        date: "2026-02-15",
        details: "Dummy credit",
        ref_no: "REF001",
        debit: 0,
        credit: 5000,
        balance: 15000,
        type: "OTHER",
        counterparty: "Dummy Party",
      },
      { onConflict: "id,statement_id" }
    );
    if (e2) throw e2;
    console.log("  ✓ bank_transactions");

    const { error: e3 } = await supabase.from("attendance_uploads").insert({
      month_year: "2026-02",
      file_name: "Dummy Attendance.pdf",
      uploaded_at: new Date().toISOString(),
      parsed_data: {
        month_year: "2026-02",
        source_type: "absent_list",
        employees: [
          { code: "SP001", name: "Dummy User", totalAbsentDays: 2, absentDates: ["10-Feb", "11-Feb"] },
        ],
      },
    });
    if (e3) throw e3;
    console.log("  ✓ attendance_uploads");

    console.log("Done. Open Bank Analyser and Attendance in the app to verify.");
  } catch (err) {
    console.error("Seed failed:", err.message);
    if (err.code === "42P01" || (err.message && (err.message.includes("schema cache") || err.message.includes("does not exist")))) {
      console.error("Run Supabase migrations first (see README). Deploy to Lovable or run: supabase db push");
    }
    process.exit(1);
  }
}

seed();
