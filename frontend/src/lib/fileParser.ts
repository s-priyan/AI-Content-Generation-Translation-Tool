/**
 * Client-side file parsing for the upload flow.
 * - .pdf → pdfjs-dist
 * - .docx → mammoth (browser bundle)
 * - .txt → FileReader
 *
 * Returns the extracted text. The caller injects it into the next user message
 * as `[Uploaded document content]: {text}` per System-implemenation-overview.docx.
 */

export async function parseFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return parseTxt(file);
  if (name.endsWith(".docx")) return parseDocx(file);
  if (name.endsWith(".pdf")) return parsePdf(file);
  throw new Error("Unsupported file type. Upload .txt, .docx, or .pdf.");
}

function parseTxt(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file);
  });
}

async function parseDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // mammoth doesn't ship browser-only types; cast the dynamic import.
  const mammoth = (await import(
    /* webpackIgnore: false */ "mammoth/mammoth.browser" as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )) as any;
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value as string;
}

async function parsePdf(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");
  // worker shim — bundled by webpack at build time
  // @ts-expect-error — pdfjs-dist types lag the worker import path
  await import("pdfjs-dist/build/pdf.worker.min.mjs");
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    out.push(text);
  }
  return out.join("\n\n");
}
