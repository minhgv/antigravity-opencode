import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEnvelope,
  extractModelIdFromUrl,
  unwrapSseResponseStream,
  isGoogleGenerativeUrl,
  createAntigravityFetch,
  adaptToolsForModel,
  getAntigravityHeaders,
  postProcessContents,
  sanitizeForOpenApi,
  sanitizeGenerationConfig,
  isMinimalThinkingSupported,
  extractRetryDelay,
  requiresToolCallId,
  normalizeToolCallId,
  resolveWireModelId,
  SKIP_THOUGHT_SIGNATURE,
  ANTIGRAVITY_MODEL_CATALOG,
} from "../transport.js";
import { generatePKCE, buildAuthUrl, toExpires } from "../oauth.js";
import { writeMeta, readMeta } from "../store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("oauth helpers", () => {
  it("generates pkce verifier/challenge", () => {
    const { verifier, challenge } = generatePKCE();
    assert.ok(verifier.length > 20);
    assert.ok(challenge.length > 20);
    assert.notEqual(verifier, challenge);
  });

  it("builds auth url with required params", () => {
    const url = buildAuthUrl({ challenge: "ch", state: "st" });
    const u = new URL(url);
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("access_type"), "offline");
    assert.ok(u.searchParams.get("scope")?.includes("cloud-platform"));
  });

  it("toExpires applies 5min buffer", () => {
    const now = Date.now();
    const exp = toExpires(3600);
    assert.ok(exp < now + 3600 * 1000);
    assert.ok(exp > now + 3000 * 1000);
  });
});

describe("transport", () => {
  it("extracts model id from generative language url", () => {
    const id = extractModelIdFromUrl(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent?alt=sse",
    );
    assert.equal(id, "gemini-3-flash");
  });

  it("detects google generative urls", () => {
    assert.equal(
      isGoogleGenerativeUrl(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent",
      ),
      true,
    );
    assert.equal(isGoogleGenerativeUrl("https://api.openai.com/v1/chat/completions"), false);
  });

  it("builds antigravity envelope preserving tools + injects system", () => {
    const geminiBody = {
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      tools: [{ functionDeclarations: [{ name: "bash", description: "run", parameters: { type: "object" } }] }],
      generationConfig: { temperature: 0.2 },
    };
    const env = buildEnvelope(geminiBody, { projectId: "proj-1", modelId: "gemini-3-flash" });
    assert.equal(env.project, "proj-1");
    assert.equal(env.model, "gemini-3-flash");
    assert.equal(env.requestType, "agent");
    assert.equal(env.userAgent, "antigravity");
    assert.equal(env.request.tools[0].functionDeclarations[0].name, "bash");
    // OpenClaw omits sessionId unless caller supplies it
    assert.equal(env.request.sessionId, undefined);
    assert.ok(env.request.systemInstruction.parts.some((p) => String(p.text).includes("You are Antigravity")));
    assert.equal(env.request.systemInstruction.role, "user");
  });

  it("adapts Claude tools to sanitized legacy parameters", () => {
    const tools = [
      {
        functionDeclarations: [
          {
            name: "bash",
            parametersJsonSchema: {
              $schema: "https://json-schema.org/draft/2020-12/schema",
              type: "object",
              properties: { cmd: { type: "string" } },
            },
          },
        ],
      },
    ];
    const adapted = adaptToolsForModel(tools, "claude-sonnet-4-5-thinking");
    assert.ok(adapted[0].functionDeclarations[0].parameters);
    assert.equal(adapted[0].functionDeclarations[0].parameters.$schema, undefined);
    assert.equal(adapted[0].functionDeclarations[0].parametersJsonSchema, undefined);
  });

  it("sanitizeForOpenApi strips meta keys", () => {
    const s = sanitizeForOpenApi({ $schema: "x", type: "object", $defs: {}, properties: { a: { type: "string" } } });
    assert.equal(s.$schema, undefined);
    assert.equal(s.$defs, undefined);
    assert.equal(s.type, "object");
  });

  it("postProcessContents adds gemini-3 functionCall thoughtSignature sentinel", () => {
    const contents = [
      {
        role: "model",
        parts: [{ functionCall: { name: "bash", args: { c: "ls" } } }],
      },
    ];
    const out = postProcessContents(contents, "gemini-3-flash");
    assert.equal(out[0].parts[0].thoughtSignature, SKIP_THOUGHT_SIGNATURE);
  });

  it("postProcessContents normalizes tool ids for claude", () => {
    assert.equal(requiresToolCallId("claude-sonnet-4-5"), true);
    assert.equal(normalizeToolCallId("a/b:c!"), "a_b_c_");
    const contents = [
      {
        role: "model",
        parts: [{ functionCall: { name: "bash", args: {}, id: "bad/id:1" } }],
      },
      {
        role: "user",
        parts: [{ functionResponse: { name: "bash", response: { output: "ok" }, id: "bad/id:1" } }],
      },
    ];
    const out = postProcessContents(contents, "claude-sonnet-4-5");
    assert.equal(out[0].parts[0].functionCall.id, "bad_id_1");
    assert.equal(out[1].parts[0].functionResponse.id, "bad_id_1");
  });

  it("skips empty text parts", () => {
    const contents = [
      {
        role: "model",
        parts: [{ text: "   " }, { text: "keep" }],
      },
    ];
    const out = postProcessContents(contents, "claude-sonnet-4-5");
    assert.equal(out[0].parts.length, 1);
    assert.equal(out[0].parts[0].text, "keep");
  });

  it("antigravity headers include UA and claude beta when needed", () => {
    const h1 = getAntigravityHeaders("gemini-3-flash");
    assert.match(h1["User-Agent"], /^antigravity\//);
    assert.equal(h1["anthropic-beta"], undefined);

    process.env.OPENCODE_AGY_UA_MODE = "cli";
    const hCli = getAntigravityHeaders("gemini-3-flash");
    assert.match(hCli["User-Agent"], /^antigravity\/cli\/1\.1\.13 \(aidev_client;/);
    delete process.env.OPENCODE_AGY_UA_MODE;

    process.env.OPENCODE_AGY_UA_MODE = "sdk";
    const hSdk = getAntigravityHeaders("gemini-3-flash");
    assert.match(hSdk["User-Agent"], /^antigravity\/1\.21\.9/);
    delete process.env.OPENCODE_AGY_UA_MODE;

    process.env.OPENCODE_AGY_UA_MODE = "desktop";
    const hDesk = getAntigravityHeaders("gemini-3-flash");
    assert.match(hDesk["User-Agent"], /^Antigravity\//);
    delete process.env.OPENCODE_AGY_UA_MODE;

    const h2 = getAntigravityHeaders("claude-opus-4-6-thinking");
    assert.equal(h2["anthropic-beta"], "interleaved-thinking-2025-05-14");
  });

  it("extractRetryDelay parses body and headers", () => {
    assert.ok(extractRetryDelay('Please retry in 2s', null) >= 2000);
    const headers = new Headers({ "retry-after": "3" });
    assert.ok(extractRetryDelay("", { headers }) >= 3000);
  });

  it("catalog has active and provisional Gemini models", () => {
    const ids = Object.keys(ANTIGRAVITY_MODEL_CATALOG);
    for (const need of [
      "gemini-3.8-flash",
      "gemini-3.8-flash-high",
      "gemini-3.8-flash-medium",
      "gemini-3.8-flash-low",
      "gemini-3-flash",
      "gemini-3.1-pro-high",
      "gemini-3.7-flash-high",
      "gemini-pro-agent",
      "gemini-3.5-flash-low",
    ]) {
      assert.ok(ids.includes(need), `missing ${need}`);
    }
  });

  it("sanitizeGenerationConfig maps pro-high to thinkingLevel HIGH", () => {
    const cfg = sanitizeGenerationConfig(
      { thinkingConfig: { includeThoughts: true, thinkingBudget: 8192 } },
      "gemini-3.1-pro-high",
    );
    assert.equal(cfg.thinkingConfig.thinkingLevel, "HIGH");
    assert.equal(cfg.thinkingConfig.thinkingBudget, undefined);
  });

  it("buildEnvelope injects HIGH thinking for pro-high when missing", () => {
    const env = buildEnvelope(
      { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
      { projectId: "p", modelId: "gemini-3.1-pro-high" },
    );
    assert.equal(env.request.generationConfig.thinkingConfig.thinkingLevel, "HIGH");
  });
  it("buildEnvelope injects appropriate thinking for gemini-3.8-flash variants", () => {
    const envHigh = buildEnvelope(
      { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
      { projectId: "p", modelId: "gemini-3.8-flash-high" },
    );
    assert.equal(envHigh.request.generationConfig.thinkingConfig.thinkingLevel, "HIGH");
    assert.equal(envHigh.model, "gemini-3.8-flash-high");

    const envBase = buildEnvelope(
      { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
      { projectId: "p", modelId: "gemini-3.8-flash" },
    );
    assert.equal(envBase.request.generationConfig.thinkingConfig.thinkingLevel, "LOW");
    assert.equal(envBase.model, "gemini-3.8-flash");
  });

  it("sanitizeGenerationConfig maps thinking level per model variant and floors 3.7+ MINIMAL", () => {
    assert.equal(isMinimalThinkingSupported("gemini-3.6-flash-high"), true);
    assert.equal(isMinimalThinkingSupported("gemini-3.7-flash-high"), false);
    assert.equal(isMinimalThinkingSupported("gemini-3.8-flash-high"), false);
    assert.equal(isMinimalThinkingSupported("gemini-3.8-flash"), false);
    assert.equal(isMinimalThinkingSupported("gemini-4-flash"), false);
    // gemini-3.7-flash-high maps to HIGH
    const t37High = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3.7-flash-high");
    assert.equal(t37High.thinkingConfig.thinkingLevel, "HIGH");
    assert.equal(t37High.thinkingConfig.thinkingBudget, undefined);

    // gemini-3.7-flash-medium maps to MEDIUM
    const t37Med = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3.7-flash-medium");
    assert.equal(t37Med.thinkingConfig.thinkingLevel, "MEDIUM");
    assert.equal(t37Med.thinkingConfig.thinkingBudget, undefined);

    // gemini-3.7-flash-low maps to LOW
    const t37Low = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3.7-flash-low");
    assert.equal(t37Low.thinkingConfig.thinkingLevel, "LOW");
    assert.equal(t37Low.thinkingConfig.thinkingBudget, undefined);

    // explicit MINIMAL on 3.7 bumped to LOW (backend rejects MINIMAL)
    const explicit = sanitizeGenerationConfig({ thinkingConfig: { thinkingLevel: "minimal" } }, "gemini-3.7-flash-low");
    assert.equal(explicit.thinkingConfig.thinkingLevel, "LOW");

    // gemini-3.8-flash-high maps to HIGH
    const t38High = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3.8-flash-high");
    assert.equal(t38High.thinkingConfig.thinkingLevel, "HIGH");
    assert.equal(t38High.thinkingConfig.thinkingBudget, undefined);

    // gemini-3.8-flash-medium maps to MEDIUM
    const t38Med = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3.8-flash-medium");
    assert.equal(t38Med.thinkingConfig.thinkingLevel, "MEDIUM");
    assert.equal(t38Med.thinkingConfig.thinkingBudget, undefined);

    // gemini-3.8-flash-low maps to LOW
    const t38Low = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3.8-flash-low");
    assert.equal(t38Low.thinkingConfig.thinkingLevel, "LOW");
    assert.equal(t38Low.thinkingConfig.thinkingBudget, undefined);

    // gemini-3.8-flash (base) maps to LOW
    const t38Base = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3.8-flash");
    assert.equal(t38Base.thinkingConfig.thinkingLevel, "LOW");
    assert.equal(t38Base.thinkingConfig.thinkingBudget, undefined);

    // explicit MINIMAL on 3.8 bumped to LOW (backend rejects MINIMAL)
    const explicit38 = sanitizeGenerationConfig({ thinkingConfig: { thinkingLevel: "minimal" } }, "gemini-3.8-flash-low");
    assert.equal(explicit38.thinkingConfig.thinkingLevel, "LOW");

    // 3.6 flash high maps to HIGH
    const t36High = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3.6-flash-high");
    assert.equal(t36High.thinkingConfig.thinkingLevel, "HIGH");

    // generic 3-flash defaults to MINIMAL (supported on 3.0-3.6)
    const t3Flash = sanitizeGenerationConfig({ thinkingConfig: { thinkingBudget: 8192 } }, "gemini-3-flash");
    assert.equal(t3Flash.thinkingConfig.thinkingLevel, "MINIMAL");
  });

  it("unwraps SSE response envelope incrementally", async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const input = [
      'data: {"response":{"candidates":[{"content":{"parts":[{"text":"A"}]}}]}}\n',
      "\n",
      'data: {"response":{"candidates":[{"content":{"parts":[{"functionCall":{"name":"bash","args":{"c":"ls"}}}]}}]}}\n',
      "\n",
    ].join("");
    const stream = new ReadableStream({
      start(c) {
        for (const ch of input) c.enqueue(encoder.encode(ch));
        c.close();
      },
    });
    const outStream = unwrapSseResponseStream(stream);
    const reader = outStream.getReader();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    assert.match(text, /"text":"A"/);
    assert.match(text, /"functionCall"/);
    assert.doesNotMatch(text, /"response":/);
  });

  it("unwraps SSE with CRLF and multi-event chunks", async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const chunk =
      ": keep-alive\r\n" +
      'data: {"response":{"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}}\r\n\r\n' +
      'data: {"response":{"candidates":[{"content":{"parts":[{"functionCall":{"name":"t","args":{}}}]}}]}}\r\n\r\n';
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(encoder.encode(chunk));
        c.close();
      },
    });
    const outStream = unwrapSseResponseStream(stream);
    const reader = outStream.getReader();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    assert.match(text, /"text":"Hi"/);
    assert.match(text, /"functionCall"/);
    assert.doesNotMatch(text, /"response":/);
  });

  it("custom fetch rewrites to v1internal and unwraps with signature post-process", async () => {
    const calls = [];
    const mockFetch = async (url, init) => {
      calls.push({ url: String(url), body: init?.body });
      const payload = `data: ${JSON.stringify({
        response: {
          candidates: [{ content: { parts: [{ text: "ok" }, { functionCall: { name: "t", args: {} } }] } }],
        },
      })}\n\n`;
      return new Response(payload, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    };

    const fetchImpl = createAntigravityFetch({
      getAccessToken: async () => "token-x",
      getProjectId: async () => "proj-x",
      fetchImpl: mockFetch,
    });

    const res = await fetchImpl(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent?alt=sse",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": "should-strip" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: "hi" }] },
            {
              role: "model",
              parts: [{ functionCall: { name: "bash", args: { c: "ls" } } }],
            },
          ],
          tools: [{ functionDeclarations: [{ name: "bash" }] }],
        }),
      },
    );

    assert.equal(res.status, 200);
    assert.ok(String(calls[0].url).includes("/v1internal:streamGenerateContent"));
    const sent = JSON.parse(calls[0].body);
    assert.equal(sent.project, "proj-x");
    assert.equal(sent.model, "gemini-3-flash");
    // Gemini-3 functionCall in history should get thoughtSignature sentinel
    const modelParts = sent.request.contents.find((c) => c.role === "model").parts;
    assert.equal(modelParts[0].thoughtSignature, SKIP_THOUGHT_SIGNATURE);

    const text = await res.text();
    assert.match(text, /"text":"ok"/);
    assert.doesNotMatch(text, /"response":/);
  });

  it("handles 401 with forceRefresh token recovery", async () => {
    let tokenCalls = 0;
    const tokens = ["expired-token", "fresh-token"];
    let requestCount = 0;

    const mockFetch = async (url, init) => {
      requestCount++;
      const authHeader = init?.headers?.get("Authorization") || "";
      if (authHeader.includes("expired-token")) {
        return new Response(JSON.stringify({ error: { code: 401, message: "Unauthorized" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: "success" }] } }] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const fetchImpl = createAntigravityFetch({
      getAccessToken: async (opts) => {
        if (opts?.forceRefresh) {
          return tokens[1];
        }
        return tokenCalls++ === 0 ? tokens[0] : tokens[1];
      },
      getProjectId: async () => "proj-x",
      fetchImpl: mockFetch,
    });

    const res = await fetchImpl(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent",
      {
        method: "POST",
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "hi" }] }] }),
      },
    );

    assert.equal(res.status, 200);
    assert.equal(requestCount, 2);
    const text = await res.text();
    assert.match(text, /"text":"success"/);
  });

  it("matches missing tool response ids for Claude models", () => {
    const contents = [
      {
        role: "model",
        parts: [{ functionCall: { name: "readFile", args: { path: "a.txt" } } }],
      },
      {
        role: "user",
        parts: [{ functionResponse: { name: "readFile", response: { content: "data" } } }],
      },
    ];
    const out = postProcessContents(contents, "claude-sonnet-4-5");
    const fcId = out[0].parts[0].functionCall.id;
    const frId = out[1].parts[0].functionResponse.id;
    assert.ok(fcId);
    assert.equal(frId, fcId);
  });

  it("extractModelIdFromUrl handles encoded chars and provider prefix", () => {
    assert.equal(
      extractModelIdFromUrl("https://generativelanguage.googleapis.com/v1beta/models/google-antigravity/gemini-3.7-flash-high:streamGenerateContent"),
      "gemini-3.7-flash-high",
    );
    assert.equal(
      extractModelIdFromUrl("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash-high%3AstreamGenerateContent"),
      "gemini-3.7-flash-high",
    );
  });

  it("propagates cancel to underlying SSE stream body", async () => {
    let cancelledWithReason = null;
    const underlying = new ReadableStream({
      start() {},
      cancel(reason) {
        cancelledWithReason = reason;
      },
    });
    const wrapped = unwrapSseResponseStream(underlying);
    await wrapped.cancel("user aborted");
    assert.equal(cancelledWithReason, "user aborted");
  });

  it("supports Request object as input with buffered body", async () => {
    let capturedBody = null;
    const mockFetch = async (url, init) => {
      capturedBody = init?.body;
      return new Response(JSON.stringify({ response: { text: "ok" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const fetchImpl = createAntigravityFetch({
      getAccessToken: async () => "token-x",
      getProjectId: async () => "proj-x",
      fetchImpl: mockFetch,
    });

    const req = new Request(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent",
      {
        method: "POST",
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "via-request-object" }] }] }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await fetchImpl(req);
    assert.equal(res.status, 200);
    assert.ok(capturedBody);
    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.request.contents[0].parts[0].text, "via-request-object");
  });
});

describe("store sidecar", () => {
  it("writes and reads projectId with isolation path", () => {
    const dir = mkdtempSync(join(tmpdir(), "agy-meta-"));
    const path = join(dir, "meta.json");
    writeMeta({ projectId: "p1", email: "a@b.c" }, path);
    const m = readMeta(path);
    assert.equal(m.projectId, "p1");
    assert.equal(m.email, "a@b.c");
    rmSync(dir, { recursive: true, force: true });
  });
});
