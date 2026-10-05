import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasUsableText, readPdfText } from "../lib/pdf-text";
import { detectInjection, processExtraction, quoteInSource } from "../lib/safety";

let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
};
const load = (f: string) => new Uint8Array(readFileSync(new URL(`../eval/fixtures/${f}`, import.meta.url)));

async function main() {
  console.log("PDF reading");

  await test("a text PDF is read as text, and the dates are in it", async () => {
    const r = await readPdfText(load("syllabus-text.pdf"));
    assert.ok(r && hasUsableText(r.text));
    assert.ok(r!.text.includes("16 October 2026"));
  });

  await test("a scanned (image-only) PDF is not treated as readable text", async () => {
    const r = await readPdfText(load("syllabus-scanned.pdf"));
    assert.ok(!r || !hasUsableText(r.text));
  });

  await test("garbage bytes don't crash, they return null", async () => {
    assert.equal(await readPdfText(new Uint8Array([1, 2, 3, 4])), null);
  });

  await test("a quote is found in PDF text even with ligatures, odd dashes and broken lines", () => {
    const src = "Quiz 1 (online): Friday 16 Octo-\nber 2026 – 10%\nFinal eﬁxam";
    assert.ok(quoteInSource("Quiz 1 (online): Friday 16 October 2026 - 10%", src));
    assert.ok(!quoteInSource("Quiz 1 (online): Friday 17 October 2026 - 10%", src));
  });

  await test("PDF text lets a good item verify and a made-up date get flagged", async () => {
    const r = (await readPdfText(load("syllabus-text.pdf")))!;
    const out = processExtraction(
      {
        course: "ECON1101",
        items: [
          { title: "Midterm exam", type: "exam", dueDate: "2026-10-23", weightPct: 30, evidence: "Midterm exam: Friday 23 October 2026 - 30%" },
          { title: "Final exam", type: "exam", dueDate: "2026-12-17", weightPct: 35, evidence: "Final exam: 7 December 2026 - 35%" },
        ],
      },
      { today: "2026-10-05", sourceText: r.text },
    );
    const [mid, fin] = out.items;
    assert.equal(mid.verified, true);
    assert.equal(fin.verified, false);
    assert.ok((fin.verify ?? []).length > 0);
  });

  await test("hidden white text in a PDF is caught by the injection scan", async () => {
    const r = (await readPdfText(load("syllabus-hidden-injection.pdf")))!;
    assert.ok(detectInjection(r.text).length > 0);
    const clean = (await readPdfText(load("syllabus-text.pdf")))!;
    assert.equal(detectInjection(clean.text).length, 0);
  });

  console.log(`\nAll ${passed} PDF tests passed.`);
}
main();
