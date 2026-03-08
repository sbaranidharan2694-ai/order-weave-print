# Edge Functions

Both functions use AI to parse document text. They support **two** API keys (either one is enough):

1. **LOVABLE_API_KEY** – If you use Lovable, this may be auto-set; otherwise add it in Secrets.
2. **GOOGLE_GEMINI_API_KEY** – Free API key from [Google AI Studio](https://aistudio.google.com/apikey). Set this in Edge Function Secrets if you don’t have a Lovable key.

Priority: Lovable is used first if set; otherwise Gemini is used.

## parse-po

Parses **Purchase Order** PDF text into structured JSON.

- **Request:** `POST` with body `{ "pdfText": "<text extracted from PDF>" }`
- **Response:** `{ "success": true, "data": { po_number, vendor_name, line_items, ... } }` or `{ "error": "..." }`
- **Used by:** Import PO page (after client-side PDF text extraction)
- **Limits:** `pdfText` max 200KB
- **Secrets:** `LOVABLE_API_KEY` **or** `GOOGLE_GEMINI_API_KEY` (at least one required)

## parse-document

Parses **Bank Statement** PDF text into structured JSON.

- **Request:** `POST` with body `{ "pdfText": "...", "parseMode": "bank_statement" | "auto" }`
- **Response:** `{ "success": true, "data": { account_holder, account_number, transactions, ... } }` or `{ "error": "..." }`
- **Used by:** Bank Analyser (after client-side PDF text extraction)
- **Limits:** `pdfText` max 500KB
- **Secrets:** `LOVABLE_API_KEY` **or** `GOOGLE_GEMINI_API_KEY` (at least one required)
- **Note:** For Purchase Orders use the `parse-po` function instead.

## Deploy

```bash
supabase functions deploy parse-po
supabase functions deploy parse-document
```

In Supabase Dashboard → Edge Functions → each function → **Secrets**, add **one** of:

- **LOVABLE_API_KEY** – your Lovable AI gateway key (if using Lovable), or  
- **GOOGLE_GEMINI_API_KEY** – free key from https://aistudio.google.com/apikey

## Test

From the project root:

```bash
npm run test:edge-functions
```

Or with custom URL/key:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key node scripts/test-edge-functions.mjs
```

The script sends minimal sample PO and bank statement text to both functions. If no AI key is set, you’ll see a 503 message telling you to set either `LOVABLE_API_KEY` or `GOOGLE_GEMINI_API_KEY`.
