import { describe, expect, it } from "vitest";
import { parsePOText } from "@/utils/parsePOText";

describe("parsePOText regression cases", () => {
  it("handles GG Organics PDF-style merged columns without footer rows", () => {
    const raw = `
PURCHASE ORDER
To ,
Dispatch Mode : Incoterms : Immediate
Payment Terms :
PO No : GGOR/104PRO/4/1997 Date : 26-Mar-2026
G.G. ORGANICS PRIVATE LIMITED
GST No : 33AACCG6299G1ZG
P-PM-00627  LABEL EXP  4821102  1,650.00 NOS  0.90  0.00  0.00  0.00  0.00  0.00  0.00  1,485.00
Total  1,650.00  0.00  0.00  0.00  1,485.00
Amount in Words (₹) : One Thousand Four Hundred Eighty-Five Rupees Only  Subtotal (₹)  1,485.00
Grand Total (₹) : 1,485.00
`;

    const parsed = parsePOText(raw);

    expect(parsed.po_number).toBe("GGOR/104PRO/4/1997");
    expect(parsed.po_date).toBe("2026-03-26");
    expect(parsed.customer?.name).toContain("G.G. ORGANICS");
    expect(parsed.customer?.gst_number).toBe("33AACCG6299G1ZG");
    expect(parsed.line_items.every((li) => !/^(total|amount in words|subtotal)/i.test(li.description))).toBe(true);
  });

  it("handles CGRD Excel-style header blocks and preserves explicit quantities only", () => {
    const raw = `
PURCHASE ORDER
=== CUSTOMER (FROM) ===
M/s. CGRD Chemicals India Pvt Ltd		PO NO	145-03/25-26
186 B Sipcot Industrial Estate		DATE :	26.03.26
Ranipet		60 DAYS CREDIT PERIOD
632403
GST IN: 33AALCC5735C1ZW
=== SELLER (TO) ===
SUPER PRINTERS
S no	PRODUCT NAME	BATCH NO		Price / kg	Qty	TOTAL [units: KG / AMOUNT]
1	GIANITAN R4	15L25AD		8	204	1632
2	GIANITAN M6	13L0125		8	600	4800
3	GIANITAN OS	16L25AD		8	204	1632
CGST 9%		1404
SGST 9%		1404
TOTAL		18408
`;

    const parsed = parsePOText(raw);

    expect(parsed.po_number).toBe("145-03/25-26");
    expect(parsed.po_date).toBe("2026-03-26");
    expect(parsed.customer?.name).toContain("CGRD Chemicals");
    expect(parsed.customer?.gst_number).toBe("33AALCC5735C1ZW");
    expect(parsed.line_items.length).toBeGreaterThanOrEqual(3);
    expect(parsed.line_items.every((li) => li.quantity > 0)).toBe(true);
  });
});
