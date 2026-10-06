import { extractFromSyllabusWithMeta } from "./extraction";
import { repairExtraction } from "./repair";
import { processExtraction, type RawResult } from "./safety";
import type { ExtractResponse, ReadMeta } from "./types";

export interface PipelineInput {
  /** Text sent to the AI (pasted text, or text pulled from a PDF). */
  text?: string;
  file?: { mime: string; data: string } | null;
  today: string;
  source?: ReadMeta["source"];
}

export interface PipelineOutput {
  result: ExtractResponse;
  /** The model's answer after any repair, for scoring and debugging. */
  raw: RawResult;
  /** The model's first answer, before repair. */
  firstRaw: RawResult;
  /** The result as it was before repair, so the effect of repair can be measured. */
  firstResult: ExtractResponse;
}

/**
 * Read, check, repair. The web route and the evaluation script both call this,
 * so what gets measured is what students get.
 */
export async function runExtraction(input: PipelineInput): Promise<PipelineOutput> {
  const verifiable = !input.file && !!input.text;
  const { raw: firstRaw, meta } = await extractFromSyllabusWithMeta({
    text: input.text,
    file: input.file,
    today: input.today,
  });
  const firstResult = processExtraction(firstRaw, {
    today: input.today,
    sourceText: verifiable ? input.text : undefined,
  });

  let raw = firstRaw;
  let result = firstResult;
  let calls = meta.calls;
  let ms = meta.ms;
  let repair: ReadMeta["repair"];

  if (verifiable) {
    const started = Date.now();
    const out = await repairExtraction({
      raw: firstRaw,
      result: firstResult,
      sourceText: input.text!,
      today: input.today,
    });
    if (out.report) {
      raw = out.raw;
      result = out.result;
      repair = out.report;
      calls += out.calls;
      ms += Date.now() - started;
      const r = out.report;
      const parts = [`${r.fixed} fixed`, `${r.removed} removed`, `${r.stillFlagged} still need your check`];
      result.warnings.unshift(
        `${r.attempted} item${r.attempted === 1 ? " was" : "s were"} sent back to the AI to re-read: ${parts.join(", ")}.`,
      );
    }
  }

  result.meta = {
    provider: meta.provider,
    model: meta.model,
    calls,
    ms,
    fellBack: meta.fellBack,
    source: input.source ?? (input.file ? "file" : "text"),
    repair,
  };
  return { result, raw, firstRaw, firstResult };
}
