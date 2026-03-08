import { extractTextFromPdf } from "./extractPdfText";
import { parseBankStatementWithAI, type BankStatementData } from "./parseBankStatementAI";
import {
  parsePurchaseOrder,
  type PurchaseOrderData,
} from "./parsePurchaseOrder";

export type ParsedDocument = BankStatementData | PurchaseOrderData;
export type { BankStatementData, PurchaseOrderData };

export type DocType = "bank_statement" | "purchase_order" | "unknown";

export interface ParseResult {
  success: boolean;
  docType: DocType;
  data?: ParsedDocument;
  rawText?: string;
  error?: string;
  fileName: string;
  pageCount?: number;
}

export async function parseDocument(
  file: File,
  forceMode?: DocType
): Promise<ParseResult> {
  if (!file) {
    return {
      success: false,
      docType: "unknown",
      error: "No file provided",
      fileName: "",
    };
  }

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return {
      success: false,
      docType: "unknown",
      error: `Only PDF files are supported. Got: ${file.type || file.name}`,
      fileName: file.name,
    };
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      success: false,
      docType: "unknown",
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum is 10MB.`,
      fileName: file.name,
    };
  }

  try {
    // For bank statements, use AI parsing
    if (forceMode === "bank_statement" || !forceMode) {
      try {
        const { data, pageCount } = await parseBankStatementWithAI(file);
        return {
          success: true,
          docType: "bank_statement",
          data,
          fileName: file.name,
          pageCount,
        };
      } catch (aiErr) {
        // If forced bank_statement, propagate error
        if (forceMode === "bank_statement") {
          throw aiErr;
        }
        // Otherwise fall through to try PO
      }
    }

    // For purchase orders, extract text and parse locally
    const { text: rawText, pageCount } = await extractTextFromPdf(file);
    if (!rawText || rawText.trim().length < 50) {
      return {
        success: false,
        docType: "unknown",
        error: "Could not extract text from PDF. File may be scanned/image-based.",
        fileName: file.name,
        rawText,
      };
    }

    if (forceMode === "purchase_order") {
      const data = parsePurchaseOrder(rawText);
      return { success: true, docType: "purchase_order", data, rawText, fileName: file.name, pageCount };
    }

    return {
      success: false,
      docType: "unknown",
      error: "Could not identify document type.",
      fileName: file.name,
      rawText,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parsing error";
    return {
      success: false,
      docType: "unknown",
      error: message,
      fileName: file.name,
    };
  }
}
