import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parsePOText } from "@/utils/parsePOText";

const fixture = (name: string) =>
  readFileSync(path.resolve(__dirname, "fixtures/po", name), "utf-8");

describe("PO contract expectations", () => {
  it("does not emit footer rows as line items for GG Organics fixture", () => {
    const parsed = parsePOText(fixture("gg-organics.txt"));
    expect(parsed.line_items.every((li) => !/^(total|subtotal|amount in words|cgst|sgst|igst)/i.test(li.description))).toBe(true);
  });

  it("keeps only explicit-quantity rows in CGRD fixture", () => {
    const parsed = parsePOText(fixture("cgrd-chemicals.txt"));
    expect(parsed.line_items.length).toBeGreaterThan(0);
    expect(parsed.line_items.every((li) => Number(li.quantity) > 0)).toBe(true);
  });
});
