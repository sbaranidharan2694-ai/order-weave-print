/**
 * Extract flat text from Excel (.xlsx) for PO parser pipeline.
 * Reads all sheets and converts to line-by-line text for parse-po / rule parser.
 */

import * as XLSX from "xlsx";

export async function extractTextFromExcel(file: File): Promise<{ text: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  let text = "";

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as (string | number)[][];

    rows.forEach((row) => {
      const cells = (Array.isArray(row) ? row : []).map((c) =>
        c != null ? String(c).trim() : ""
      );
      text += cells.join(" ") + "\n";
    });
  });

  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (typeof console !== "undefined" && console.log) {
    console.log("[extractExcelText] file:", file.name, "extracted length:", text.length, "first 200:", text.slice(0, 200));
  }
  return { text };
}
