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
    expect(parsed.line_items[0].total_amount).toBe(1250 + 112.50 + 112.50);
    expect(parsed.line_items[0].description).toBeTruthy();
    if (parsed.line_items.length >= 2) {
      expect(parsed.line_items[1].qty).toBe(1000);
      expect(parsed.line_items[1].unit_price).toBe(1.8);
      expect(parsed.line_items[1].total_amount).toBe(1800 + 162 + 162);
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

describe("parsePOText - sample PDFs (SUPER_6682, 252566, SUPER_1742, SUPER_1779, ListOfSubconPurchaseOrder)", () => {
  it("parses SUPER_6682 style: List of Subcon + SUPER 6682 + table", () => {
    const raw = `
List of Subcon Purchase Order
SUPER 6682
Date: 04/03/2026

Sr No  Description              Qty   Unit Price  Amount
1      Safety inspection tag    3000  3.50        10500.00
2      Final inspection tag     2000  1.50        3000.00
Total                           5000              13500.00
`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(1);
    expect(parsed.po_number).toBe("SUPER_6682");
    expect(parsed.vendor_name).toBeTruthy();
    if (parsed.line_items.length >= 1) {
      expect(parsed.line_items[0].qty).toBe(3000);
      expect(parsed.line_items[0].unit_price).toBe(3.5);
      expect(parsed.line_items[0].total_amount).toBe(10500);
    }
    if (parsed.line_items.length >= 2) {
      expect(parsed.line_items[1].qty).toBe(2000);
      expect(parsed.line_items[1].unit_price).toBe(1.5);
      expect(parsed.line_items[1].total_amount).toBe(3000);
    }
  });

  it("parses 252566 style: Guindy LOC format", () => {
    const raw = `
GUINDY MACHINE TOOLS LIMITED
LOC252566  04032026

Sl No  Description                              Qty   Unit Price  Amount
1      FINAL INSPECTION TAG BLUE COLOUR         3000  1.50        4500.00
2      INWARD/OUTWARD/FINAL INSPECTION TAG PAD   5000  1.50        7500.00
3      BIN CARD                                 6000  1.50        9000.00

Delivery Date  06032026
Payment Terms  30 DAYS CREDIT
Prepared by  KRISHNAN
GST No.  33AAACG1118Q1ZP
`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(1);
    expect(parsed.po_number).toBe("LOC252566");
    expect(parsed.vendor_name).toBe("Guindy Machine Tools Limited");
    if (parsed.line_items.length >= 1) {
      expect(parsed.line_items[0].qty).toBe(3000);
      expect(parsed.line_items[0].unit_price).toBe(1.5);
      expect(parsed.line_items[0].total_amount).toBe(4500);
    }
    if (parsed.line_items.length >= 3) {
      expect(parsed.line_items[2].description).toMatch(/BIN CARD/i);
      expect(parsed.line_items[2].qty).toBe(6000);
      expect(parsed.line_items[2].total_amount).toBe(9000);
    }
  });

  it("parses SUPER_1742 style: List of Subcon with SUPER 1742", () => {
    const raw = `
List of Subcon Purchase Order
SUPER 1742
Date: 05/03/2026

Sr No  Description           Qty  Unit Price  Amount
1      WHSE CUT BOARDS      2400 3.50       8400.00
2      Sticker pad          500  2.00       1000.00
Total                       2900             9400.00
`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(1);
    expect(parsed.po_number).toBe("SUPER_1742");
    if (parsed.line_items.length >= 1) {
      expect(parsed.line_items[0].qty).toBe(2400);
      expect(parsed.line_items[0].unit_price).toBe(3.5);
      expect(parsed.line_items[0].total_amount).toBe(8400);
    }
  });

  it("parses SUPER_1779 style: SUPER 1779 + line items", () => {
    const raw = `
List of Subcon Purchase Order
SUPER 1779
Date: 04/03/2026

Sr No  Description    Qty  Unit Price  Amount
1      Flex Banner   10   150.00     1500.00
2      Sticker       50   2.00       100.00
`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(1);
    expect(parsed.po_number).toBe("SUPER_1779");
    if (parsed.line_items.length >= 2) {
      expect(parsed.line_items[0].qty).toBe(10);
      expect(parsed.line_items[0].total_amount).toBe(1500);
      expect(parsed.line_items[1].qty).toBe(50);
      expect(parsed.line_items[1].total_amount).toBe(100);
    }
  });

  it("parses ListOfSubconPurchaseOrder style (combined list header)", () => {
    const raw = `
ListOfSubconPurchaseOrder - 2026-02-26T153848.063
SUPER PRINTERS
Purchase Order
Date: 26-Feb-2026

Sr No  Description       Qty  Unit Price  Total
1      Item One          100  10.00      1000.00
2      Item Two          50   20.00      1000.00
Total                    150              2000.00
`;
    const parsed = parsePOText(raw);
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(1);
    expect(parsed.vendor_name).toBe("Super Printers");
    if (parsed.line_items.length >= 1) {
      expect(parsed.line_items[0].qty).toBe(100);
      expect(parsed.line_items[0].unit_price).toBe(10);
      expect(parsed.line_items[0].total_amount).toBe(1000);
    }
    if (parsed.line_items.length >= 2) {
      expect(parsed.line_items[1].qty).toBe(50);
      expect(parsed.line_items[1].total_amount).toBe(1000);
    }
  });
});
