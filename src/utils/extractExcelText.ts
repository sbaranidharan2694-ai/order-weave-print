/**
 * Extract flat text from Excel (.xlsx) for PO parser pipeline.
 * Resolves formula strings (=F21*G21, =SUM(...), =H29*9%) so amounts
 * are not lost when the xlsx has no cached computed values.
 */

import * as XLSX from "xlsx";

const DEBUG = typeof import.meta !== "undefined" && import.meta.env?.DEV === true;

export async function extractTextFromExcel(file: File): Promise<{ text: string }> {
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (e) {
    throw new Error("Failed to read Excel file. The file may be in use or corrupted.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: "array" });
  } catch (e) {
    throw new Error("Failed to parse Excel file. The file may be corrupted or not a valid .xlsx.");
  }

  let text = "";

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const cellValues: Record<string, number> = {};
    for (const addr of Object.keys(sheet)) {
      if (addr.startsWith("!")) continue;
      const cell = sheet[addr];
      if (cell && cell.t === "n" && typeof cell.v === "number") {
        cellValues[addr.toUpperCase()] = cell.v;
      }
    }

    function resolveFormula(formula: string): string {
      if (!formula.startsWith("=")) return formula;
      const expr = formula.slice(1).trim().toUpperCase();
      const mulMatch = expr.match(/^([A-Z]+\d+)\*([A-Z]+\d+)$/);
      if (mulMatch) {
        const a = cellValues[mulMatch[1]];
        const b = cellValues[mulMatch[2]];
        if (a !== undefined && b !== undefined) return String(Math.round(a * b * 100) / 100);
      }
      const sumMatch = expr.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
      if (sumMatch) {
        const col = sumMatch[1];
        const startRow = parseInt(sumMatch[2], 10);
        const endRow = parseInt(sumMatch[4], 10);
        let sum = 0;
        for (let r = startRow; r <= endRow; r++) sum += cellValues[`${col}${r}`] ?? 0;
        return String(Math.round(sum * 100) / 100);
      }
      const pctMatch = expr.match(/^([A-Z]+\d+)\*(\d+(?:\.\d+)?)%$/);
      if (pctMatch) {
        const a = cellValues[pctMatch[1]];
        const pct = parseFloat(pctMatch[2]) / 100;
        if (a !== undefined) return String(Math.round(a * pct * 100) / 100);
      }
      const refMatch = expr.match(/^([A-Z]+\d+)$/);
      if (refMatch) {
        const v = cellValues[refMatch[1]];
        if (v !== undefined) return String(v);
      }
      return formula;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    }) as (string | number)[][];

    rows.forEach((row) => {
      const cells = (Array.isArray(row) ? row : []).map((c) => {
        const str = c != null ? String(c).trim() : "";
        return str.startsWith("=") ? resolveFormula(str) : str;
      });
      text += cells.join("\t") + "\n";
    });
  });

  text = text.replace(/\n{3,}/g, "\n\n").trim();
  if (DEBUG) {
    console.log("[extractExcelText] file:", file.name, "length:", text.length, "preview:", text.slice(0, 300));
  }
  return { text };
}
