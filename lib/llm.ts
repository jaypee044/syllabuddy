import Anthropic from "@anthropic-ai/sdk";

/**
 * One place that talks to the AI provider.
 *
 * - Claude is used when ANTHROPIC_API_KEY is set, otherwise Gemini (free tier).
 * - Output is always forced into a fixed JSON structure.
 * - Each call has a timeout, and transient failures (rate limits, server
 *   errors, network drops, malformed JSON) are retried once.
 */

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
// Google retires Gemini models over time. If you see a 404 "model is no longer
// available", set GEMINI_MODEL in .env.local to the model name the error suggests.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const TIMEOUT_MS = 28_000;
const MAX_ATTEMPTS = 3;
// Stop retrying once this much time has passed, so a request never outlives the route's time limit.
const RETRY_BUDGET_MS = 35_000;

export const NO_KEY_MESSAGE =
  "No API key is set. Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to .env.local and restart the dev server.";

/** Ignore empty values and copied placeholders like "your-key-here". */
const looksReal = (k?: string) => !!k && k.trim().length >= 20 && !/^your[-_ ]/i.test(k.trim());

function keys() {
  const a = process.env.ANTHROPIC_API_KEY?.trim();
  const g = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  return { anthropic: looksReal(a) ? a : undefined, gemini: looksReal(g) ? g : undefined };
}

/** Which model will be tried first, for labelling evaluation results. */
export function describeProvider(): string {
  const k = keys();
  if (k.anthropic) return `Claude (${CLAUDE_MODEL})`;
  if (k.gemini) return `Gemini (${GEMINI_MODEL}, with fallback to other Flash models if busy)`;
  return "no provider configured";
}

export function hasApiKey(): boolean {
  const k = keys();
  return !!(k.anthropic || k.gemini);
}

export interface GenerateOptions {
  instructions: string;
  /** Untrusted or user-supplied text, already wrapped in tags by the caller. */
  textParts?: string[];
  /** A PDF or image, base64 encoded. */
  file?: { mime: string; data: string } | null;
  toolName: string;
  toolDescription: string;
  schema: Anthropic.Messages.Tool["input_schema"];
  /** Plain-text description of the JSON shape, used by the Gemini path. */
  shapeHint: string;
}

type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

async function viaClaude(o: GenerateOptions, apiKey: string): Promise<unknown> {
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (o.file) {
    content.push(
      o.file.mime === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: o.file.data } }
        : { type: "image", source: { type: "base64", media_type: o.file.mime as ImageType, data: o.file.data } },
    );
  }
  for (const t of o.textParts ?? []) content.push({ type: "text", text: t });
  content.push({ type: "text", text: `${o.instructions}\n\nCall ${o.toolName} exactly once.` });

  const message = await new Anthropic({ apiKey }).messages.create(
    {
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      tools: [{ name: o.toolName, description: o.toolDescription, input_schema: o.schema }],
      tool_choice: { type: "tool", name: o.toolName },
      messages: [{ role: "user", content }],
    },
    { timeout: TIMEOUT_MS },
  );

  const toolUse = message.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) throw new Error("The AI did not return structured data.");
  return toolUse.input;
}

async function viaGemini(o: GenerateOptions, apiKey: string, model: string): Promise<unknown> {
  const parts: Array<Record<string, unknown>> = [];
  if (o.file) parts.push({ inline_data: { mime_type: o.file.mime, data: o.file.data } });
  for (const t of o.textParts ?? []) parts.push({ text: t });
  parts.push({ text: `${o.instructions}\n\nReply with JSON only, in exactly this shape:\n${o.shapeHint}` });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    const message =
      res.status === 429 || res.status === 503
        ? "The AI service is busy right now. Wait a few seconds and try again. The sample semester works without it."
        : res.status === 401 || res.status === 403
          ? "The AI key was rejected. Check GEMINI_API_KEY in .env.local and restart the server."
          : `Gemini returned ${res.status}: ${detail}`;
    const err = new Error(message);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const out = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!out) throw new Error("Gemini returned no content.");
  try {
    return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new Error("Gemini returned something that wasn't valid JSON.");
  }
}

// ---- Gemini model fallback -------------------------------------------------
// Free-tier models get overloaded or retired. When the main model is busy or
// gone, ask Google which other Flash models this key can use and try those.

let modelCache: string[] | null = null;

const versionOf = (name: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 0);

async function listGeminiModels(apiKey: string): Promise<string[]> {
  if (modelCache) return modelCache;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    modelCache = (json.models ?? [])
      .filter((m) => m.name && m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name!.replace(/^models\//, ""))
      .filter((n) => /flash/i.test(n) && !/(image|tts|live|audio|embedding|robotics|computer|exp|-\d{3,}$)/i.test(n))
      .sort(
        (a, b) =>
          versionOf(b) - versionOf(a) || Number(/lite/i.test(a)) - Number(/lite/i.test(b)),
      );
    return modelCache;
  } catch {
    return [];
  }
}

const statusOf = (err: unknown) => (err as { status?: number }).status;
const isCapacityError = (err: unknown) => [404, 429, 503].includes(statusOf(err) ?? 0);

async function viaGeminiWithFallback(o: GenerateOptions, apiKey: string): Promise<unknown> {
  try {
    return await viaGemini(o, apiKey, GEMINI_MODEL);
  } catch (first) {
    if (!isCapacityError(first)) throw first;
    let last: unknown = first;
    const alternatives = (await listGeminiModels(apiKey)).filter((m) => m !== GEMINI_MODEL).slice(0, 3);
    for (const model of alternatives) {
      try {
        return await viaGemini(o, apiKey, model);
      } catch (err) {
        last = err;
        if (!isCapacityError(err)) throw err;
      }
    }
    throw last;
  }
}

/** Auth and bad-request errors won't fix themselves; everything else might. */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number }).status;
  if (typeof status === "number") return status === 408 || status === 409 || status === 429 || status >= 500;
  return true; // network error, timeout, malformed output
}

/**
 * Tries Claude first when a real Anthropic key is set, then Gemini. If the
 * first provider fails for good (bad key, outage), the next one is tried, so a
 * single misconfigured key doesn't take the whole app down.
 */
export async function generateJson(o: GenerateOptions): Promise<Record<string, unknown>> {
  const k = keys();
  const providers: Array<() => Promise<unknown>> = [];
  if (k.anthropic) providers.push(() => viaClaude(o, k.anthropic!));
  if (k.gemini) providers.push(() => viaGeminiWithFallback(o, k.gemini!));
  if (providers.length === 0) throw new Error(NO_KEY_MESSAGE);

  let last: unknown;
  const startedAt = Date.now();
  for (const call of providers) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const out = await call();
        if (!out || typeof out !== "object" || Array.isArray(out)) {
          throw new Error("The AI returned data in the wrong shape.");
        }
        return out as Record<string, unknown>;
      } catch (err) {
        last = err;
        if (attempt === MAX_ATTEMPTS || !isRetryable(err)) break;
        if (Date.now() - startedAt > RETRY_BUDGET_MS) break;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw last instanceof Error ? last : new Error("The AI request failed.");
}
