/**
 * Load PDF.js and extract text from a PDF file (for attendance parsing).
 */

async function getPdfJs() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;
  return pdfjsLib;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = doc.numPages;
  const lines: string[] = [];
  for (let p = 1; p <= numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; transform: number[] }>;
    const yGroups = new Map<number, string[]>();
    for (const it of items) {
      if (!it.str?.trim()) continue;
      const y = Math.round((it.transform[5] ?? 0) / 2) * 2;
      if (!yGroups.has(y)) yGroups.set(y, []);
      yGroups.get(y)!.push(it.str);
    }
    const sortedY = [...yGroups.keys()].sort((a, b) => b - a);
    for (const y of sortedY) {
      const parts = yGroups.get(y) ?? [];
      lines.push(parts.join(" ").trim());
    }
    (page as { cleanup?: () => void }).cleanup?.();
  }
  return lines.join("\n");
}
