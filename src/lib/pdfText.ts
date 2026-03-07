/**
 * Load PDF.js and extract text from a PDF file (for attendance parsing).
 */

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

function getPdfJs(): Promise<typeof import("pdfjs-dist")> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("PDF.js runs in browser only"));
      return;
    }
    const w = window as Window & { pdfjsLib?: typeof import("pdfjs-dist") };
    if (w.pdfjsLib) {
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
      resolve(w.pdfjsLib);
      return;
    }
    const script = document.createElement("script");
    script.src = `${PDFJS_CDN}/pdf.min.js`;
    script.onload = () => {
      const lib = (window as Window & { pdfjsLib: typeof import("pdfjs-dist") }).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.js`;
      resolve(lib);
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(script);
  });
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
