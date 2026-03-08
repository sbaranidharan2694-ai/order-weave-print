#!/usr/bin/env node
/**
 * Test script for Supabase Edge Functions: parse-po and parse-document.
 * Usage:
 *   Set env vars: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)
 *   Then: node scripts/test-edge-functions.mjs
 * Or with .env: node -r dotenv/config scripts/test-edge-functions.mjs
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        const val = m[2].trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnv();

// Use .env or env vars; fallback to project defaults (same as client) for local testing
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://hlpmmdmgdgyzsxnnrdjl.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhscG1tZG1nZGd5enN4bm5yZGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzM2NTEsImV4cCI6MjA4ODQ0OTY1MX0.F7cOqdgjk0FIXWjH8QovNGNe-w5hisVAHfiUuJGs5sg";

const SAMPLE_PO_TEXT = `
PURCHASE ORDER
PO No: PO-2026-001
Date: 25-02-2026
Vendor: Contemporary Leather Pvt Ltd
GST No.: 33AABCC1234D1Z5
Delivery Date: 10-03-2026
Payment terms: 60 DAYS

S.No | Description        | HSN  | QTY | UOM | Unit Price | Base Amount | CGST% | CGST Amt | SGST% | SGST Amt | Total
1    | Letterhead A4      | 4817 | 100 | NOS | 12.00      | 1200.00     | 9     | 108.00   | 9     | 108.00   | 1416.00
2    | Visiting Cards     | 4911 | 500 | NOS | 2.00       | 1000.00     | 9     | 90.00    | 9     | 90.00    | 1180.00

Grand Total: 2596.00
`;

const SAMPLE_BANK_TEXT = `
STATEMENT OF ACCOUNT
CSB Bank Ltd
Account Holder: SUPER PRINTERS
Account Number: 0244020077280
Branch: Chennai
IFSC: CSBK0000123
Period: 01-01-2026 to 31-01-2026

Opening Balance: 100000.00
Total Credits: 50000.00
Total Debits: 25000.00
Closing Balance: 125000.00

Date       | Details           | Ref No    | Debit    | Credit   | Balance
01-01-2026 | NEFT Cr - ABC Ltd | NEFT123   | 0        | 25000.00 | 125000.00
02-01-2026 | UPI/DR/9876543210 | UPI456    | 5000.00  | 0        | 120000.00
`;

async function invoke(name, body) {
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY (or VITE_* equivalents). Set in .env or environment.");
    process.exit(1);
  }
  console.log("Using Supabase URL:", SUPABASE_URL.replace(/https?:\/\//, "").split("/")[0]);

  console.log("Testing Edge Functions...\n");
  console.log("1) parse-po");
  const poResult = await invoke("parse-po", { pdfText: SAMPLE_PO_TEXT });
  if (poResult.ok && poResult.data?.success && poResult.data?.data) {
    const d = poResult.data.data;
    console.log("   OK - got po_number:", d.po_number ?? "(none)", "line_items:", Array.isArray(d.line_items) ? d.line_items.length : 0);
  } else {
    const err = poResult.data?.error ?? poResult.data?._raw ?? JSON.stringify(poResult.data);
    console.log("   FAIL - status:", poResult.status, "error:", err);
    if (poResult.status === 503 && typeof err === "string" && err.includes("GOOGLE_GEMINI_API_KEY")) {
      console.log("   Tip: Add GOOGLE_GEMINI_API_KEY (free at https://aistudio.google.com/apikey) in Edge Function Secrets.");
    }
  }

  console.log("\n2) parse-document (bank_statement)");
  const docResult = await invoke("parse-document", { pdfText: SAMPLE_BANK_TEXT, parseMode: "bank_statement" });
  if (docResult.ok && docResult.data?.success && docResult.data?.data) {
    const d = docResult.data.data;
    console.log("   OK - account_holder:", d.account_holder ?? "(none)", "transactions:", Array.isArray(d.transactions) ? d.transactions.length : 0);
  } else {
    const err = docResult.data?.error ?? docResult.data?._raw ?? JSON.stringify(docResult.data);
    console.log("   FAIL - status:", docResult.status, "error:", err);
    if (docResult.status === 503 && typeof err === "string" && err.includes("GOOGLE_GEMINI_API_KEY")) {
      console.log("   Tip: Add GOOGLE_GEMINI_API_KEY (free at https://aistudio.google.com/apikey) in Edge Function Secrets.");
    }
  }

  const bothOk = poResult.ok && docResult.ok;
  console.log(bothOk ? "\nAll tests passed." : "\nSome tests failed.");
  process.exit(bothOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
