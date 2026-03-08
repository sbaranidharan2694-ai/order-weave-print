/**
 * Extract flat text from Excel (.xlsx) Sheet1 for PO parser pipeline.
 * Uses SheetJS (xlsx) to read workbook and convert first sheet to line-by-line text.
 */

import * as XLSX from "xlsx";

export async function extractTextFromExcel(file: File): Promise<{ text: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0] ?? "Sheet1";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("No sheet found in Excel file.");
  }
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];
  const lines = rows.map((row) => {
    const cells = (row as unknown as (string | number)[]).map((c) =>
      c != null ? String(c).trim() : ""
    );
    return cells.join(" ");
  });
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text };
}
