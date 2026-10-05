import { NextResponse } from "next/server";
import { extractFromSyllabus } from "@/lib/extraction";
import { hasApiKey, NO_KEY_MESSAGE } from "@/lib/llm";
import { processExtraction, type RawResult } from "@/lib/safety";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  if (!hasApiKey()) return fail(NO_KEY_MESSAGE, 500);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Expected multipart form data.");
  }

  const upload = form.get("file");
  const text = String(form.get("text") ?? "").trim();
  const today = String(form.get("today") ?? new Date().toISOString().slice(0, 10));

  if (text.length > MAX_TEXT_CHARS) {
    return fail("That text is too long. Paste just the assessment and schedule sections.");
  }

  let file: { mime: string; data: string } | null = null;
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_FILE_BYTES) return fail("File is larger than 10 MB.");
    if (upload.type !== "application/pdf" && !IMAGE_TYPES.includes(upload.type)) {
      return fail("Upload a PDF or an image (PNG, JPG, WEBP), or paste the text.");
    }
    file = {
      mime: upload.type,
      data: Buffer.from(await upload.arrayBuffer()).toString("base64"),
    };
  }
  if (!file && !text) return fail("Provide a syllabus file or paste its text.");

  let raw: RawResult;
  try {
    raw = await extractFromSyllabus({ text, file, today });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return fail(`Extraction failed: ${msg}`, 502);
  }

  // Nothing the model returned is trusted: check it against the source before
  // it reaches the student. Quotes can only be verified against pasted text.
  const result = processExtraction(raw, { today, sourceText: file ? undefined : text });
  return NextResponse.json(result);
}
