/**
 * Auto-Learning PO Parser System
 * Stores and reuses field mappings from previously parsed PO documents.
 */
import { supabase } from "@/integrations/supabase/client";

/* ─── Types ─── */
export interface ParsePattern {
  id: string;
  customer_name: string | null;
  document_signature: string;
  field_label: string;
  mapped_field: string;
  confidence_score: number;
  times_used: number;
}

export interface LearnedMapping {
  [rawLabel: string]: string; // e.g. "order ref" → "po_number"
}

/* ─── Document Signature Generation ─── */
export function generateDocSignature(text: string): string {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 10);

  // Extract label-like patterns (words ending with : or followed by values)
  const labels = lines
    .map(l => {
      const m = l.match(/^([A-Za-z\s.#]+?)[\s]*[:|\-|–]/);
      return m ? m[1].toLowerCase().trim() : "";
    })
    .filter(Boolean);

  const raw = lines.join("|") + "||" + labels.join(",");
  // Simple hash — not crypto, just fingerprinting
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "sig_" + Math.abs(hash).toString(36);
}

/* ─── Lookup Existing Patterns ─── */
export async function lookupPatterns(signature: string): Promise<ParsePattern[]> {
  const { data, error } = await (supabase as any)
    .from("po_parse_patterns")
    .select("*")
    .eq("document_signature", signature)
    .order("confidence_score", { ascending: false });

  if (error) {
    console.warn("[poPatternLearning] Lookup error:", error.message);
    return [];
  }
  return (data || []) as ParsePattern[];
}

/* ─── Apply Learned Mappings ─── */
export function applyLearnedMappings(
  text: string,
  patterns: ParsePattern[]
): LearnedMapping {
  const mapping: LearnedMapping = {};
  for (const p of patterns) {
    if (p.confidence_score >= 0.5) {
      mapping[p.field_label] = p.mapped_field;
    }
  }
  console.log("[poPatternLearning] Applied mappings:", Object.keys(mapping).length);
  return mapping;
}

/** Extract values from text using learned label→field mappings */
export function extractWithLearnedMappings(
  text: string,
  mappings: LearnedMapping
): Record<string, string> {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const result: Record<string, string> = {};

  for (const [rawLabel, field] of Object.entries(mappings)) {
    for (let i = 0; i < lines.length; i++) {
      const norm = lines[i].toLowerCase();
      if (norm.includes(rawLabel)) {
        // Value is after the label on same line, or next line
        const afterLabel = lines[i]
          .substring(norm.indexOf(rawLabel) + rawLabel.length)
          .replace(/^[\s:;\-–—]+/, "")
          .trim();
        if (afterLabel.length > 1) {
          result[field] = afterLabel;
        } else if (i + 1 < lines.length) {
          result[field] = lines[i + 1].trim();
        }
        break;
      }
    }
  }

  console.log("[poPatternLearning] Extracted fields:", Object.keys(result));
  return result;
}

/* ─── Learn from Successful Parse ─── */
export async function learnFromParse(
  text: string,
  parsedResult: Record<string, any>,
  customerName: string | null
): Promise<void> {
  // Validate: only learn if we have meaningful data
  const poNumber = parsedResult.po_number || parsedResult.po_number;
  const lineItems = parsedResult.line_items;
  if (!poNumber && (!Array.isArray(lineItems) || lineItems.length === 0)) {
    console.log("[poPatternLearning] Skipping learning — insufficient data");
    return;
  }

  const signature = generateDocSignature(text);
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Detect label→field mappings from the text
  const KNOWN_FIELDS: Record<string, string[]> = {
    po_number: ["po", "purchase order", "order no", "order number", "po no", "ref", "indent"],
    customer: ["customer", "client", "company", "bill to", "buyer", "vendor", "party"],
    quantity: ["qty", "quantity", "ordered", "units"],
    amount: ["amount", "total", "grand total", "net"],
    delivery_date: ["delivery", "due date", "dispatch", "ship"],
    po_date: ["date", "po date", "order date"],
  };

  const newPatterns: Array<{
    customer_name: string | null;
    document_signature: string;
    field_label: string;
    mapped_field: string;
    confidence_score: number;
  }> = [];

  for (const [field, keywords] of Object.entries(KNOWN_FIELDS)) {
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const norm = lines[i].toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      for (const kw of keywords) {
        if (norm.includes(kw) && norm.length < 60) {
          // Extract the raw label portion
          const labelMatch = lines[i].match(/^([A-Za-z\s.#()]+?)[\s]*[:\-–—]/);
          if (labelMatch) {
            const rawLabel = labelMatch[1].toLowerCase().trim();
            if (rawLabel.length >= 2 && rawLabel.length <= 40) {
              newPatterns.push({
                customer_name: customerName,
                document_signature: signature,
                field_label: rawLabel,
                mapped_field: field,
                confidence_score: 0.7,
              });
            }
          }
          break;
        }
      }
    }
  }

  if (newPatterns.length === 0) {
    console.log("[poPatternLearning] No new patterns to learn");
    return;
  }

  // Upsert: check for existing patterns first
  const { data: existing } = await (supabase as any)
    .from("po_parse_patterns")
    .select("id, field_label, mapped_field, times_used, confidence_score")
    .eq("document_signature", signature);

  const existingMap = new Map<string, { id: string; field_label: string; mapped_field: string; times_used: number; confidence_score: number }>(
    (existing || []).map((e: any) => [`${e.field_label}::${e.mapped_field}`, e])
  );

  const toInsert: typeof newPatterns = [];
  const toUpdate: Array<{ id: string; times_used: number; confidence_score: number }> = [];

  for (const p of newPatterns) {
    const key = `${p.field_label}::${p.mapped_field}`;
    const ex = existingMap.get(key);
    if (ex) {
      // Increment confidence
      const newConf = Math.min(0.99, ex.confidence_score + 0.05);
      toUpdate.push({ id: ex.id, times_used: ex.times_used + 1, confidence_score: newConf });
    } else {
      toInsert.push(p);
    }
  }

  // Batch insert new patterns
  if (toInsert.length > 0) {
    await (supabase as any).from("po_parse_patterns").insert(toInsert);
    console.log(`[poPatternLearning] Stored ${toInsert.length} new patterns`);
  }

  // Update existing patterns
  for (const u of toUpdate) {
    await (supabase as any)
      .from("po_parse_patterns")
      .update({ times_used: u.times_used, confidence_score: u.confidence_score, updated_at: new Date().toISOString() })
      .eq("id", u.id);
  }

  if (toUpdate.length > 0) {
    console.log(`[poPatternLearning] Updated confidence for ${toUpdate.length} patterns`);
  }
}

/* ─── Get All Known Formats (for debug panel) ─── */
export async function getKnownFormats(): Promise<Array<{
  customer_name: string | null;
  document_signature: string;
  pattern_count: number;
  avg_confidence: number;
  total_uses: number;
}>> {
  const { data, error } = await (supabase as any)
    .from("po_parse_patterns")
    .select("customer_name, document_signature, confidence_score, times_used");

  if (error || !data) return [];

  // Group by signature
  const groups = new Map<string, { customer_name: string | null; scores: number[]; uses: number[] }>();
  for (const row of data as ParsePattern[]) {
    const existing = groups.get(row.document_signature);
    if (existing) {
      existing.scores.push(row.confidence_score);
      existing.uses.push(row.times_used);
    } else {
      groups.set(row.document_signature, {
        customer_name: row.customer_name,
        scores: [row.confidence_score],
        uses: [row.times_used],
      });
    }
  }

  return Array.from(groups.entries()).map(([sig, g]) => ({
    customer_name: g.customer_name,
    document_signature: sig,
    pattern_count: g.scores.length,
    avg_confidence: Math.round((g.scores.reduce((a, b) => a + b, 0) / g.scores.length) * 100) / 100,
    total_uses: g.uses.reduce((a, b) => a + b, 0),
  }));
}
