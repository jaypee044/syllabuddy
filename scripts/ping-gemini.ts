/**
 * Times a tiny request on each Gemini Flash model your key can use, so you can
 * see which ones are fast right now and set GEMINI_MODEL to the best one.
 *
 *   npm run ping
 *
 * It never prints your key.
 */
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.log("No GEMINI_API_KEY found in .env.local.");
  process.exit(1);
}

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const versionOf = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);

async function listModels(): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=100`, { headers: { "x-goog-api-key": key! } });
  if (!res.ok) throw new Error(`ListModels returned ${res.status}`);
  const json = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
  return (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /flash/i.test(n) && !/(image|tts|live|audio|embedding|robotics|computer|exp|-\d{3,}$)/i.test(n))
    .sort((a, b) => versionOf(b) - versionOf(a));
}

async function time(model: string, thinking: boolean): Promise<string> {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: 'Reply with JSON only: {"ok": true}' }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
          ...(thinking
            ? { thinkingConfig: versionOf(model) >= 3 ? { thinkingLevel: "low" } : { thinkingBudget: 0 } }
            : {}),
        },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const s = ((Date.now() - started) / 1000).toFixed(1);
    if (res.ok) return `${s}s ok`;
    const body = (await res.text()).slice(0, 80).replace(/\s+/g, " ");
    return `${s}s HTTP ${res.status} ${body}`;
  } catch (e) {
    const s = ((Date.now() - started) / 1000).toFixed(1);
    return `${s}s ${(e as Error).name === "TimeoutError" ? "TIMED OUT" : (e as Error).message}`;
  }
}

(async () => {
  const models = (await listModels()).slice(0, 6);
  console.log(`Timing ${models.length} models with a tiny request (25s limit each)...\n`);
  for (const m of models) {
    const low = await time(m, true);
    const plain = await time(m, false);
    console.log(`${m}\n   low thinking: ${low}\n   default:      ${plain}`);
  }
  console.log("\nSet GEMINI_MODEL in .env.local to the fastest model that says ok, then restart npm run dev.");
})();
