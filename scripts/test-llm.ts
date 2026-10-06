process.env.GEMINI_API_KEY = "test-key-test-key-test-key-1234";
delete process.env.ANTHROPIC_API_KEY;
process.env.LLM_BACKOFF_MS = "0";

import assert from "node:assert/strict";

/**
 * Reliability tests: the AI client is run against a pretend Gemini that is busy,
 * retired, slow, confused or rejecting the key, and we check what the student
 * would get each time. No real AI calls are made.
 */

const OPTS = {
  instructions: "Extract.",
  textParts: ["<syllabus>x</syllabus>"],
  toolName: "t",
  toolDescription: "t",
  schema: { type: "object" as const, properties: {} },
  shapeHint: "{}",
};

const ok = (data: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] }), { status: 200 });
const text = (t: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] }), { status: 200 });
const status = (n: number) => new Response("boom", { status: n });
const models = () =>
  new Response(
    JSON.stringify({
      models: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"].map((n) => ({
        name: `models/${n}`,
        supportedGenerationMethods: ["generateContent"],
      })),
    }),
    { status: 200 },
  );

let generateCalls: string[] = [];
function pretend(handler: (model: string, n: number) => Response | Promise<Response>) {
  generateCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(":generateContent")) {
      const model = /models\/([^:]+):/.exec(url)![1];
      generateCalls.push(model);
      return handler(model, generateCalls.length);
    }
    return models();
  }) as typeof fetch;
}

async function main() {
  const { generateJsonWithMeta, resetModelCache } = await import("../lib/llm");
  let passed = 0;
  const test = async (name: string, fn: () => Promise<void>) => {
    resetModelCache();
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  };

  console.log("AI client reliability");

  await test("a normal answer comes back with the model name and one call", async () => {
    pretend(() => ok({ a: 1 }));
    const { data, meta } = await generateJsonWithMeta(OPTS);
    assert.deepEqual(data, { a: 1 });
    assert.equal(meta.model, "gemini-3.8-flash");
    assert.equal(meta.calls, 1);
    assert.equal(meta.fellBack, false);
  });

  await test("when the main model is busy (503), a backup model answers", async () => {
    pretend((model) => (model === "gemini-3.8-flash" ? status(503) : ok({ a: 2 })));
    const { data, meta } = await generateJsonWithMeta(OPTS);
    assert.deepEqual(data, { a: 2 });
    assert.notEqual(meta.model, "gemini-3.8-flash");
    assert.equal(meta.fellBack, true);
  });

  await test("when the main model has been retired (404), a backup model answers", async () => {
    pretend((model) => (model === "gemini-3.8-flash" ? status(404) : ok({ a: 3 })));
    const { meta } = await generateJsonWithMeta(OPTS);
    assert.equal(meta.fellBack, true);
  });

  await test("a timeout is retried and then succeeds", async () => {
    pretend((_m, n) => {
      if (n === 1) throw Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
      return ok({ a: 4 });
    });
    const { data, meta } = await generateJsonWithMeta(OPTS);
    assert.deepEqual(data, { a: 4 });
    assert.equal(meta.calls, 2);
  });

  await test("a reply that isn't valid JSON is retried", async () => {
    pretend((_m, n) => (n === 1 ? text("Sure! Here you go: {oops") : ok({ a: 5 })));
    const { data, meta } = await generateJsonWithMeta(OPTS);
    assert.deepEqual(data, { a: 5 });
    assert.equal(meta.calls, 2);
  });

  await test("JSON wrapped in a code fence is still read", async () => {
    pretend(() => text('```json\n{"a": 6}\n```'));
    const { data } = await generateJsonWithMeta(OPTS);
    assert.deepEqual(data, { a: 6 });
  });

  await test("a rejected key fails straight away with a clear message and no retries", async () => {
    pretend(() => status(401));
    await assert.rejects(generateJsonWithMeta(OPTS), /key was rejected/i);
    assert.equal(generateCalls.length, 1);
  });

  await test("when every model is busy, it gives up after a few tries with a friendly message", async () => {
    pretend(() => status(503));
    await assert.rejects(generateJsonWithMeta(OPTS), /busy right now/i);
    assert.ok(generateCalls.length <= 12, `made ${generateCalls.length} calls`);
  });

  await test("an answer of the wrong shape (a list) is refused", async () => {
    pretend(() => ok([1, 2, 3]));
    await assert.rejects(generateJsonWithMeta(OPTS), /wrong shape/i);
  });

  await test("an empty reply is retried, not accepted", async () => {
    pretend((_m, n) =>
      n === 1 ? new Response(JSON.stringify({ candidates: [] }), { status: 200 }) : ok({ a: 7 }),
    );
    const { data } = await generateJsonWithMeta(OPTS);
    assert.deepEqual(data, { a: 7 });
  });

  console.log(`\nAll ${passed} AI client tests passed.`);
}
main();
