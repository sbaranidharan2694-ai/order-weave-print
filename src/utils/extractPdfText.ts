import * as pdfjsLib from "pdfjs-dist";

// CDN worker — required for Vite, do NOT use local import
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

export interface ExtractResult {
  text: string;
  pageCount: number;
  isPasswordProtected: boolean;
}

export async function extractTextFromPdf(
  source: File | ArrayBuffer | Blob | string,
  password?: string
): Promise<ExtractResult> {
  let data: ArrayBuffer;

  if (source instanceof File || source instanceof Blob) {
    data = await source.arrayBuffer();
  } else if (typeof source === "string") {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
    data = await res.arrayBuffer();
  } else {
    data = source;
  }

  const loadParams: Record<string, unknown> = { data };
  if (password != null && String(password).trim() !== "") {
    loadParams.password = String(password).trim();
  }

  let pdf: pdfjsLib.PDFDocumentProxy;

  try {
    pdf = await pdfjsLib.getDocument(loadParams).promise;
  } catch (err: unknown) {
    const errName = (err as { name?: string })?.name;
    if (errName === "PasswordException" || /password|no password/i.test(String((err as Error)?.message ?? ""))) {
      throw new Error("PASSWORD_REQUIRED");
    }
    throw err;
  }

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    let lastY: number | null = null;
    const lines: string[] = [];
    let currentLine = "";

    for (const item of textContent.items) {
      if ("str" in item) {
        const ti = item as { str: string; transform: number[] };
        const y = ti.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = "";
        }
        currentLine += ti.str + " ";
        lastY = y;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pageTexts.push(lines.join("\n"));
  }

  return {
    text: pageTexts.join("\n\n"),
    pageCount: pdf.numPages,
    isPasswordProtected: !!password,
  };
}
