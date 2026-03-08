import { describe, expect, it } from "vitest";
import { parsePOText } from "@/utils/parsePOText";

// ─── 1. Guindy Machine Tools (LOC/252566) ─────────────────────────────
describe("parsePOText - Guindy Machine Tools (252566)", () => {
  const raw = `PO No & Date : LOC/252566 04/03/2026

Vendor's Name & Address
SC0886
SUPER PRINTERS
NO.98,CHAVADI STREET,
PALLAVARAM
CHENNAI 600 043.
PinCode : 600 043
Currency: INDIAN RUPEES
Payment Terms: 30 DAYS CREDIT
Delivery Method: DOOR DELIVERY
Delivery Date: 06/03/2026
Vendor: AS PER PREVIOUS SUPPLY
Prepared by: KRISHNAN

Please arrange to supply us the following

Sl. No  Item Number  Purchase Req. No. / Type / Qty / UOM  Item Description  Qty & UOM  Unit Price  GST  Amount  Disc.
1  STA001221  251803 / CON  FINAL INSPECTION TAG (BLUE COLOUR)  3000 NOS  1.50  4,500.00
2  STA00121  251803 / CON  INWARD/OUTWARD/FINAL INSPECTION TAG PAD  5000 NOS  1.50  7,500.00
3  STA00346  251803 / CON  BIN CARD  6000 NOS  1.50  9,000.00

Net Value: 21,000.00
Taxable Value: 21,000.00
Total Value: 21,000.00

1. CGST,SGST,IGST EXTRA

For GUINDY MACHINE TOOLS LIMITED

GST No. 33AAACG1118Q1ZP`;

  it("extracts 3 line items with correct quantities and amounts", () => {
    const parsed = parsePOText(raw);
    expect(parsed.po_number).toBe("LOC/252566");
    expect(parsed.po_date).toBe("2026-03-04");
    expect(parsed.vendor_name).toContain("Guindy");
    expect(parsed.gst_extra).toBe(true);
    expect(parsed.line_items.length).toBe(3);

    expect(parsed.line_items[0].qty).toBe(3000);
    expect(parsed.line_items[0].unit_price).toBe(1.5);
    expect(parsed.line_items[0].base_amount).toBe(4500);
    expect(parsed.line_items[0].description).toContain("INSPECTION TAG");

    expect(parsed.line_items[1].qty).toBe(5000);
    expect(parsed.line_items[1].base_amount).toBe(7500);

    expect(parsed.line_items[2].qty).toBe(6000);
    expect(parsed.line_items[2].base_amount).toBe(9000);

    expect(parsed.base_amount).toBe(21000);
    expect(parsed.delivery_date).toBe("2026-03-06");
  });
});

// ─── 2. Fujitec (ListOfSubconPurchaseOrder) ──────────────────────────
describe("parsePOText - Fujitec (PO-FIN-M-26005326)", () => {
  const raw = `SUBCON PURCHASE ORDER

FUJITEC

Plot no-52, First Cross Road, 8th Avenue Domestic Tariff Area, Mahindra World City, Chengalpattu
CHENGALPATTU Tamil Nadu
India PIN:603004
Tel:0444741800 0441

GST No. 33AAACF8048A1Z4
PAN No. AAACF8048A

PO Organization : Fujitec India Pvt Ltd
Date : 24-Feb-2026

To,
Vendor Code : 210513
Purchase /Job Order No PO-FIN-M-26005326 (0)
M/s. SUPER PRINTER
Super Printer No.8, Saraswathi Colony Pallavaram
CHENNAI, Tamil Nadu, India 600043
Vendor GST No. 33AAGPB7462F1Z1

Sr No  Description  Part Number  Req.On Date  Cost Entity Key  Qty  UOM  Unit Price  Total Price  CGST Rate  CGST Amt  SGST Rate  SGST Amt
1  Safety inspection tag  24-02-2026  3000  Nos  3.50  10,500.00  9  945  9  945

Total: 10,500.00
GST: 1,890.00

Terms of Payment in Days: 30
Place of Completion Date: 27-Feb-2026`;

  it("extracts single line item with tax info", () => {
    const parsed = parsePOText(raw);
    expect(parsed.po_number).toBe("PO-FIN-M-26005326");
    expect(parsed.po_date).toBe("2026-02-24");
    expect(parsed.vendor_name).toContain("Fujitec");
    expect(parsed.line_items.length).toBe(1);

    const li = parsed.line_items[0];
    expect(li.qty).toBe(3000);
    expect(li.unit_price).toBe(3.5);
    expect(li.base_amount).toBe(10500);
    expect(li.cgst_percent).toBe(9);
    expect(li.cgst_amount).toBe(945);
    expect(li.sgst_percent).toBe(9);
    expect(li.sgst_amount).toBe(945);
    expect(li.description).toContain("Safety inspection tag");

    expect(parsed.tax_amount).toBe(1890);
    expect(parsed.payment_terms).toContain("30");
  });
});

// ─── 3. Contemporary Leather - SUPER_1742 ────────────────────────────
describe("parsePOText - Contemporary Leather (25261742)", () => {
  const raw = `Contemporary Leather Pvt Ltd.
2/400, Mount Poonamallee High Road, Iyyappanthangal, Poonamallee,
Chennai - 600 056, Phone : 044-26793476
GST: 33AADCC0948F1Z1

PURCHASE ORDER

PO No : 25261742 (Indicate PO No in your Supply Invoice/DC. It's Mandatory) PO Date : 25-02-26
Consignee : Super Printers
Delivery Date : 10-03-2026
Contact Person : Mr. Bharani
Contact No : 9840199878
Payment terms : 60 DAYS
Currency : INR
GSTIN No : 33AAGPB7462F1Z1

S. No  Description  HSN CODE/SAC  QTY  WHSE  UOM  Unit Price  Base Amount  CGST Rate  CGST Amount  SGST Rate  SGST Amount  IGST Rate  IGST Amount
1  CUT BOARDS 295 X 205 MM  4820  2400.00  UNIT  1 NOS  3.50  8400.00  9.00  756.00  9.00  756.00  0.00  0.00

SubTotal: 8400.00
Base Amount: 8400.00
Tax: 1512.00
Total Amount: 9,912.00

Printed by SAP Business One`;

  it("extracts line item with HSN and tax breakdown", () => {
    const parsed = parsePOText(raw);
    expect(parsed.po_number).toBe("25261742");
    expect(parsed.po_date).toBe("2026-02-25");
    expect(parsed.vendor_name).toContain("Contemporary");
    expect(parsed.line_items.length).toBe(1);

    const li = parsed.line_items[0];
    expect(li.qty).toBe(2400);
    expect(li.unit_price).toBe(3.5);
    expect(li.base_amount).toBe(8400);
    expect(li.hsn_code).toBe("4820");
    expect(li.cgst_percent).toBe(9);
    expect(li.cgst_amount).toBe(756);
    expect(li.sgst_percent).toBe(9);
    expect(li.sgst_amount).toBe(756);
    expect(li.description).toContain("CUT BOARDS");

    expect(parsed.contact_person).toContain("Bharani");
    expect(parsed.delivery_date).toBe("2026-03-10");
  });
});

// ─── 4. Contemporary Leather - SUPER_1779 ────────────────────────────
describe("parsePOText - Contemporary Leather (25261779)", () => {
  const raw = `Contemporary Leather Pvt Ltd.
2/400, Mount Poonamallee High Road, Iyyappanthangal, Poonamallee,
Chennai - 600 056
GST: 33AADCC0948F1Z1

PURCHASE ORDER

PO No : 25261779 PO Date : 05-03-26
Delivery Date : 09-03-2026
Contact Person : Mr. Bharani
Contact No : 9840199878
Payment terms : 60 DAYS
GSTIN No : 33AAGPB7462F1Z1

S. No  Description  HSN CODE/SAC  QTY  WHSE  UOM  Unit Price  Base Amount  CGST Rate  CGST Amount  SGST Rate  SGST Amount  IGST Rate  IGST Amount
1  CUT BOARDS 295 X 205 MM  4820  140.00  UNIT  1 NOS  3.50  490.00  9.00  44.10  9.00  44.10  0.00  0.00

SubTotal: 490.00
Total Amount: 578.20

Printed by SAP Business One`;

  it("extracts small qty order correctly", () => {
    const parsed = parsePOText(raw);
    expect(parsed.po_number).toBe("25261779");
    expect(parsed.line_items.length).toBe(1);

    const li = parsed.line_items[0];
    expect(li.qty).toBe(140);
    expect(li.unit_price).toBe(3.5);
    expect(li.base_amount).toBe(490);
    expect(li.cgst_amount).toBe(44.1);
    expect(li.sgst_amount).toBe(44.1);
  });
});

// ─── 5. Contemporary Leather - SUPER_6682 ────────────────────────────
describe("parsePOText - Contemporary Leather (25266682)", () => {
  const raw = `Contemporary Leather Pvt Ltd.
2/400, Mount Poonamallee High Road, Iyyappanthangal, Poonamallee,
Chennai - 600 056
GST: 33AADCC0948F1Z1

PURCHASE ORDER

PO No : 25266682 PO Date : 19-02-26
Delivery Date : 26-02-2026
Contact Person : Mr. Bharani
Contact No : 9840199878
Payment terms : 60 DAYS
GSTIN No : 33AAGPB7462F1Z1

S. No  Description  HSN CODE/SAC  QTY  WHSE  UOM  Unit Price  Base Amount  CGST Rate  CGST Amount  SGST Rate  SGST Amount  IGST Rate  IGST Amount
1  WHITE BOARD 40 X 22CM  4819  4600.00  UNIT  2 NOS  4.95  22770.00  9.00  2049.30  9.00  2049.30  0.00  0.00

SubTotal: 22770.00
Total Amount: 26,868.60

Printed by SAP Business One`;

  it("handles '2 NOS' UOM pattern correctly", () => {
    const parsed = parsePOText(raw);
    expect(parsed.po_number).toBe("25266682");
    expect(parsed.line_items.length).toBe(1);

    const li = parsed.line_items[0];
    expect(li.qty).toBe(4600);
    expect(li.unit_price).toBe(4.95);
    expect(li.base_amount).toBe(22770);
    expect(li.hsn_code).toBe("4819");
    expect(li.cgst_amount).toBe(2049.3);
    expect(li.sgst_amount).toBe(2049.3);
    expect(li.description).toContain("WHITE BOARD");
  });
});

// ─── Original tests ──────────────────────────────────────────────────
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
});
