import * as pdfjsLib from "pdfjs-dist";

// Must use CDN worker — local import breaks Vite
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

export async function extractTextFromPdf(
  source: File | string | ArrayBuffer
): Promise<{ text: string; pageCount: number }> {
  let data: ArrayBuffer;

  if (source instanceof File) {
    data = await source.arrayBuffer();
  } else if (typeof source === "string") {
    const res = await fetch(source);
    if (!res.ok)
      throw new Error(`Failed to fetch PDF from storage: ${res.status}`);
    data = await res.arrayBuffer();
  } else {
    data = source;
  }

  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    let lastY: number | null = null;
    const lines: string[] = [];
    let currentLine = "";

    for (const item of textContent.items) {
      if ("str" in item) {
        const typedItem = item as { str: string; transform: number[] };
        const y = typedItem.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = "";
        }
        currentLine += typedItem.str + " ";
        lastY = y;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pageTexts.push(lines.join("\n"));
  }

  return {
    text: pageTexts.join("\n\n"),
    pageCount: pdf.numPages,
  };
}
