/**
 * Extract structured text from Excel (.xlsx) for PO parser pipeline.
 * Improvements over v1:
 * - Uses raw: false so SheetJS returns cached formula values, not formula strings
 * - Collects ALL numeric cell.v values (including formula cells)
 * - Detects split column headers (unit on continuation row) and merges them
 * - Annotates FROM/TO section boundaries for the AI
 */

import * as XLSX from "xlsx";

const DEBUG =
  typeof import.meta !== "undefined" &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

export async function extractTextFromExcel(file: File): Promise<{ text: string }> {
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    throw new Error("Failed to read Excel file. The file may be in use or corrupted.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  } catch {
    throw new Error(
      "Failed to parse Excel file. The file may be corrupted or not a valid .xlsx.",
    );
  }

  let text = "";

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const cellValues: Record<string, number> = {};
    for (const addr of Object.keys(sheet)) {
      if (addr.startsWith("!")) continue;
      const cell = sheet[addr];
      if (cell && cell.v != null && typeof cell.v === "number") {
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
        if (a !== undefined && b !== undefined)
          return String(Math.round(a * b * 100) / 100);
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

      const pctMatch = expr.match(/^([A-Z]+\d+)\*([\d.]+)%?$/);
      if (pctMatch) {
        const a = cellValues[pctMatch[1]];
        const pct = parseFloat(pctMatch[2]) / (expr.includes("%") ? 100 : 1);
        if (a !== undefined) return String(Math.round(a * pct * 100) / 100);
      }

      const refMatch = expr.match(/^([A-Z]+\d+)$/);
      if (refMatch) {
        const v = cellValues[refMatch[1]];
        if (v !== undefined) return String(v);
      }

      const addMatch = expr.match(/^([A-Z]+\d+)\+([A-Z]+\d+)$/);
      if (addMatch) {
        const a = cellValues[addMatch[1]];
        const b = cellValues[addMatch[2]];
        if (a !== undefined && b !== undefined)
          return String(Math.round((a + b) * 100) / 100);
      }

      return formula;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as string[][];

    function isContinuationHeaderRow(row: string[], prevRow: string[]): boolean {
      const nonEmpty = row.filter((c) => c.trim() !== "");
      if (nonEmpty.length === 0 || nonEmpty.length > 3) return false;
      const unitLike =
        /^(in\s+kg|nos|pcs|nos\.|kgs?|sets?|pairs?|metres?|mtr|ltr|amount|amt|rs\.?|kg)$/i;
      return nonEmpty.every((c) => unitLike.test(c.trim()));
    }

    function getSectionAnnotation(row: string[]): string | null {
      const joined = row.join("").trim().toUpperCase();
      if (joined === "FROM") return "=== CUSTOMER (FROM) ===";
      if (joined === "TO") return "=== SELLER (TO) ===";
      return null;
    }

    const outputLines: string[] = [];
    let prevRow: string[] = [];

    rows.forEach((row) => {
      const cells = (Array.isArray(row) ? row : []).map((c) => {
        const str = c != null ? String(c).trim() : "";
        return str.startsWith("=") ? resolveFormula(str) : str;
      });

      if (cells.every((c) => c === "")) {
        prevRow = cells;
        return;
      }

      const annotation = getSectionAnnotation(cells);
      if (annotation) {
        outputLines.push(annotation);
        prevRow = cells;
        return;
      }

      if (
        isContinuationHeaderRow(cells, prevRow) &&
        outputLines.length > 0
      ) {
        const unitValues = cells.filter((c) => c.trim() !== "").join(" / ");
        const lastLine = outputLines[outputLines.length - 1];
        outputLines[outputLines.length - 1] = `${lastLine} [units: ${unitValues}]`;
        prevRow = cells;
        return;
      }

      outputLines.push(cells.join("\t"));
      prevRow = cells;
    });

    text += outputLines.join("\n") + "\n";
  });

  text = text.replace(/\n{3,}/g, "\n\n").trim();

  if (DEBUG) {
    console.log(
      "[extractExcelText] file:",
      file.name,
      "length:",
      text.length,
      "preview:",
      text.slice(0, 500),
    );
  }

  return { text };
}
