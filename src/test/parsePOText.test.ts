import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePOText } from "@/utils/parsePOText";

const fixture = (name: string) =>
  readFileSync(path.resolve(__dirname, "fixtures/po", name), "utf-8");

describe("parsePOText regression cases", () => {
  it("handles GG Organics PDF-style merged columns without footer rows", () => {
    const raw = fixture("gg-organics.txt");

    const parsed = parsePOText(raw);

    expect(parsed.po_number).toBe("GGOR/104PRO/4/1997");
    expect(parsed.po_date).toBe("2026-03-26");
    expect(parsed.customer?.name).toContain("G.G. ORGANICS");
    expect(parsed.customer?.gst_number).toBe("33AACCG6299G1ZG");
    expect(parsed.line_items.every((li) => !/^(total|amount in words|subtotal)/i.test(li.description))).toBe(true);
  });

  it("handles CGRD Excel-style header blocks and preserves explicit quantities only", () => {
    const raw = fixture("cgrd-chemicals.txt");

    const parsed = parsePOText(raw);

    expect(parsed.po_number).toBe("145-03/25-26");
    expect(parsed.po_date).toBe("2026-03-26");
    expect(parsed.customer?.name).toContain("CGRD Chemicals");
    expect(parsed.customer?.gst_number).toBe("33AALCC5735C1ZW");
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(3);
    expect(parsed.line_items.every((li) => li.quantity > 0)).toBe(true);
  });
});
