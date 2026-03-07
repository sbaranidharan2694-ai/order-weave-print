import { extractTextFromPdf } from "./extractPdfText";
import {
  parseBankStatement,
  type BankStatementData,
} from "./parseBankStatement";
import {
  parsePurchaseOrder,
  type PurchaseOrderData,
} from "./parsePurchaseOrder";

export type ParsedDocument = BankStatementData | PurchaseOrderData;
export type { BankStatementData, PurchaseOrderData };

export type DocType = "bank_statement" | "purchase_order" | "unknown";

function detectDocType(text: string): DocType {
  const upper = text.toUpperCase();
  if (
    upper.includes("STATEMENT OF ACCOUNT") ||
    upper.includes("OPENING BALANCE") ||
    upper.includes("CLOSING BALANCE") ||
    upper.includes("TOTAL CREDITS") ||
    upper.includes("TOTAL DEBITS")
  )
    return "bank_statement";

  if (
    upper.includes("PURCHASE ORDER") ||
    upper.includes("PO NO") ||
    upper.includes("VENDOR CODE") ||
    upper.includes("HSN")
  )
    return "purchase_order";

  return "unknown";
}

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
    const { text: rawText, pageCount } = await extractTextFromPdf(file);

    if (!rawText || rawText.trim().length < 50) {
      return {
        success: false,
        docType: "unknown",
        error:
          "Could not extract text from PDF. File may be scanned/image-based.",
        fileName: file.name,
        rawText,
      };
    }

    const docType = forceMode || detectDocType(rawText);

    if (docType === "unknown") {
      return {
        success: false,
        docType: "unknown",
        error:
          "Could not identify document type. Expected bank statement or purchase order.",
        fileName: file.name,
        rawText,
      };
    }

    const data: ParsedDocument =
      docType === "bank_statement"
        ? parseBankStatement(rawText)
        : parsePurchaseOrder(rawText);

    return {
      success: true,
      docType,
      data,
      rawText,
      fileName: file.name,
      pageCount,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown parsing error";
    return {
      success: false,
      docType: "unknown",
      error: message,
      fileName: file.name,
    };
  }
}
