import { describe, expect, it } from "vitest";
import { parsePOText } from "@/utils/parsePOText";

describe("parsePOText - Fujitec / SUBCON format", () => {
  it("extracts line items with correct qty, unit price, total (not Sr No or tax as qty/total)", () => {
    const raw = `SUBCON PURCHASE ORDER
FUJITEC INDIA
Purchase Job Order No: PO-FIN-M-26005326
Date: 24-Feb-2026
Completion Date: 28-Feb-2026

Sr No  Description         Part Number  Qty   UOM  Unit Price  Total Price  CGST Rate  CGST Amt  SGST Rate  SGST Amt
1       Visiting Cards       VC-001      500   NOS  2.50        1250.00      9          112.50    9          112.50
2       Brochure A4          BR-002      1000  NOS  1.80        1800.00      9          162.00    9          162.00
Total   Subtotal   3050.00`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(1);
    expect(parsed.po_number).toBeTruthy();
    // First line must be: Qty=500, Unit=2.50, Total=1250 (not Sr No=1 as qty or tax 112.50 as total)
    expect(parsed.line_items[0].qty).toBe(500);
    expect(parsed.line_items[0].unit_price).toBe(2.5);
    expect(parsed.line_items[0].total_amount).toBe(1250);
    expect(parsed.line_items[0].description).toBeTruthy();
    if (parsed.line_items.length >= 2) {
      expect(parsed.line_items[1].qty).toBe(1000);
      expect(parsed.line_items[1].unit_price).toBe(1.8);
      expect(parsed.line_items[1].total_amount).toBe(1800);
    }
  });

  it("detects SUPER / List of Subcon style and extracts line items", () => {
    const raw = `
List of Subcon Purchase Order
SUPER 1779
Date: 04/03/2026

Sr No  Description    Qty  Unit Price  Amount
1      Flex Banner   10   150.00      1500.00
2      Sticker       50   2.00        100.00
`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(1);
    if (parsed.line_items.length >= 2) {
      expect(parsed.line_items[0].qty).toBe(10);
      expect(parsed.line_items[0].total_amount).toBe(1500);
      expect(parsed.line_items[1].qty).toBe(50);
      expect(parsed.line_items[1].total_amount).toBe(100);
    }
  });

  it("skips header and total rows", () => {
    const raw = `
SUBCON PURCHASE ORDER
Sr No  Description  Qty  Unit Price  Total
1      Item A      2    100.00      200.00
Total              Subtotal        200.00
`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBe(1);
    expect(parsed.line_items[0].qty).toBe(2);
    expect(parsed.line_items[0].total_amount).toBe(200);
  });

  it("parses SUPER PRINTERS / Purchase Order format and extracts line items", () => {
    const raw = `
SUPER PRINTERS
Purchase Order
Date: 01-Mar-2026

Part Number  Description       Qty  Unit Price  Total
1            Visiting Cards    100  5.00        500.00
2            Brochure          200  2.50        500.00
`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(1);
    expect(parsed.vendor_name).toBe("Super Printers");
    if (parsed.line_items.length >= 2) {
      expect(parsed.line_items[0].qty).toBe(100);
      expect(parsed.line_items[0].total_amount).toBe(500);
      expect(parsed.line_items[1].qty).toBe(200);
      expect(parsed.line_items[1].total_amount).toBe(500);
    }
  });
});
