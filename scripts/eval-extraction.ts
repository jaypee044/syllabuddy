import { mkdirSync, writeFileSync } from "node:fs";
import { CASES } from "../eval/cases";
import { failedScore, renderReport, scoreCase, type CaseScore } from "../eval/score";
import { extractFromSyllabus } from "../lib/extraction";
import { describeProvider, hasApiKey } from "../lib/llm";
import { processExtraction, type RawResult } from "../lib/safety";

/**
 * Runs the real syllabus-reading step on test syllabi with known answers and
 * writes the scores to eval/results.md. Needs an API key in .env.local:
 *
 *   npm run eval
 */

async function main() {
  if (!hasApiKey()) {
    console.error("No API key found. Add GEMINI_API_KEY to .env.local, then run: npm run eval");
    process.exit(1);
  }

  const scores: CaseScore[] = [];
  const outputs: Record<string, unknown> = {};

  for (const c of CASES) {
    process.stdout.write(`Running "${c.name}"... `);
    try {
      const raw: RawResult = await extractFromSyllabus({ text: c.text, today: c.today });
      const processed = processExtraction(raw, { today: c.today, sourceText: c.text });
      const s = scoreCase(c, raw, processed);
      scores.push(s);
      outputs[c.id] = { raw, processed };
      console.log(`found ${s.found}/${s.expected}, correct dates ${s.dateCorrect}/${s.found}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      scores.push(failedScore(c, msg));
      console.log(`failed: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 2500)); // be gentle with free-tier rate limits
  }

  const report = renderReport(scores, {
    date: new Date().toISOString().slice(0, 10),
    provider: describeProvider(),
  });
  mkdirSync("eval", { recursive: true });
  writeFileSync("eval/results.md", report);
  writeFileSync("eval/raw-output.json", JSON.stringify(outputs, null, 2));
  console.log(`\n${report}\nSaved to eval/results.md (raw model output in eval/raw-output.json).`);
}

main();
