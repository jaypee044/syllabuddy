import { extractText, getDocumentProxy } from "unpdf";

export interface PdfText {
  text: string;
  pages: number;
}

/** Most text we'll send to the model from one PDF. Longer files are cut and the student is told. */
export const MAX_PDF_CHARS = 150_000;

/** Reads the text layer of a PDF. Returns null if it can't be opened. */
export async function readPdfText(data: Uint8Array): Promise<PdfText | null> {
  try {
    const pdf = await getDocumentProxy(data);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text: String(text ?? ""), pages: totalPages };
  } catch {
    return null;
  }
}

/**
 * A scanned PDF has no real text layer, so extraction gives little or nothing.
 * Treat it as readable text only when there is a reasonable amount of it and it
 * is mostly letters and digits rather than stray symbols.
 */
export function hasUsableText(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 150) return false;
  const wordy = compact.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return wordy / compact.length > 0.6;
}
