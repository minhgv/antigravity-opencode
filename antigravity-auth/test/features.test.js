import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  formatProgressBar,
  formatResetTime,
  remainingPercent,
  formatQuotaReport,
} from "../dist/quota/index.js";
import {
  assertSafeImageModel,
  assertSafeAspectRatio,
  resolveImageSavePath,
  buildImageGenerateRequest,
} from "../dist/image/index.js";
import {
  stableProjectId,
  defaultProjectId,
} from "../dist/auth/index.js";
import {
  GoogleAntigravityAuthPlugin,
  AntigravityAliasAuthPlugin,
  createGenerateImageTool,
} from "../dist/plugin.js";

describe("P1: Quota & Usage formatting", () => {
  it("formats progress bar with percentage", () => {
    const barEmpty = formatProgressBar(0, 10);
    assert.equal(barEmpty, "[----------]");
    const barHalf = formatProgressBar(0.5, 10);
    assert.equal(barHalf, "[#####-----]");
    const barFull = formatProgressBar(1.0, 10);
    assert.equal(barFull, "[##########]");

    assert.equal(remainingPercent(0.894149), 89.4);
    assert.equal(remainingPercent(undefined), undefined);
  });

  it("formats reset time delta", () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000).toISOString();
    const formatted = formatResetTime(futureDate);
    assert.match(formatted, /2h 1[45]m/);

    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();
    assert.equal(formatResetTime(pastDate), "now");
    assert.equal(formatResetTime(undefined), "n/a");
  });

  it("formats complete quota report", () => {
    const report = {
      projectId: "test-proj",
      endpoint: "https://cloudcode-pa.googleapis.com",
      groups: [
        {
          displayName: "Gemini Models",
          description: "Flash & Pro",
          buckets: [
            {
              bucketId: "gemini-5h",
              displayName: "Five Hour Limit Remaining",
              remainingFraction: 0.85,
              resetTime: new Date(Date.now() + 3600000).toISOString(),
            },
          ],
        },
      ],
      models: [
        {
          modelId: "gemini-3.8-flash-high",
          displayName: "Gemini 3.8 Flash",
          remainingFraction: 0.85,
          recommended: true,
        },
      ],
      fetchedAt: Date.now(),
    };

    const formatted = formatQuotaReport(report, { showModels: true });
    assert.match(formatted, /Google Antigravity Quota Status/);
    assert.match(formatted, /Gemini Models/);
    assert.match(formatted, /85% còn lại/);
    assert.match(formatted, /gemini-3.8-flash-high/);
  });
});

describe("P2: Image Generation module", () => {
  it("validates safe image models", () => {
    assert.equal(assertSafeImageModel("gemini-3-pro-image"), "gemini-3-pro-image");
    assert.equal(assertSafeImageModel("gemini-3.1-flash-image"), "gemini-3.1-flash-image");
    assert.throws(() => assertSafeImageModel("unsupported-chat-model"));
  });

  it("validates aspect ratios", () => {
    assert.equal(assertSafeAspectRatio("1:1"), "1:1");
    assert.equal(assertSafeAspectRatio("16:9"), "16:9");
    assert.equal(assertSafeAspectRatio("9:16"), "9:16");
    assert.throws(() => assertSafeAspectRatio("50:50"));
  });

  it("resolves safe image paths and prevents directory traversal", () => {
    const cwd = tmpdir();
    const safe = resolveImageSavePath(cwd, "my-image.png", "image/png");
    assert.ok(safe.endsWith("my-image.png"));

    assert.throws(() => {
      resolveImageSavePath(cwd, "../../../etc/passwd");
    });
  });

  it("builds image generation request envelope with imageConfig", () => {
    const req = buildImageGenerateRequest("a red sports car", "gemini-3-pro-image", "proj-1", "16:9");
    assert.equal(req.project, "proj-1");
    assert.equal(req.model, "gemini-3-pro-image");
    assert.equal(req.request.generationConfig.imageConfig.aspectRatio, "16:9");
    assert.equal(req.request.contents[0].parts[0].text, "a red sports car");
    assert.equal(req.requestType, undefined);
    assert.equal(req.userAgent, "antigravity");
  });
});

describe("P3: Deterministic ProjectId", () => {
  it("generates deterministic stableProjectId from email", () => {
    const p1 = stableProjectId("user@example.com");
    const p2 = stableProjectId("user@example.com");
    const p3 = stableProjectId("other@example.com");

    assert.equal(p1, p2, "same email must produce identical project ID");
    assert.notEqual(p1, p3, "different emails must produce different project IDs");
    assert.match(p1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("honors explicit ANTIGRAVITY_PROJECT_ID environment variable", () => {
    const old = process.env.ANTIGRAVITY_PROJECT_ID;
    try {
      process.env.ANTIGRAVITY_PROJECT_ID = "custom-override-id";
      assert.equal(defaultProjectId("fallback@seed.com"), "custom-override-id");
    } finally {
      if (old !== undefined) process.env.ANTIGRAVITY_PROJECT_ID = old;
      else delete process.env.ANTIGRAVITY_PROJECT_ID;
    }
  });
});

describe("Plugin Tool Registration", () => {
  it("exposes generate_image and check_quota tools on primary and alias plugins", async () => {
    const primary = await GoogleAntigravityAuthPlugin();
    assert.ok(primary.tool);
    assert.ok(primary.tool.generate_image);
    assert.equal(typeof primary.tool.generate_image.execute, "function");
    assert.ok(primary.tool.generate_image.args.prompt);

    assert.ok(primary.tool.check_quota);
    assert.equal(typeof primary.tool.check_quota.execute, "function");

    const alias = await AntigravityAliasAuthPlugin();
    assert.ok(alias.tool);
    assert.ok(alias.tool.generate_image);
    assert.ok(alias.tool.check_quota);
  });
});

describe("V2 provider replacement", () => {
  it("replaces preconfigured providers with the Antigravity SDK package and catalog", async () => {
    const { setup } = await import("../dist/plugin-v2.js");
    const providers = new Map([
      ["google-antigravity", { provider: { id: "google-antigravity" } }],
      ["antigravity", { provider: { id: "antigravity" } }],
    ]);
    const added = new Map();
    const removed = [];
    const ctx = {
      integration: {
        transform: async () => {},
        auth: { set: async () => {} },
        connection: { active: async () => undefined, resolve: async () => undefined },
      },
      provider: {
        transform: async (callback) => callback({
          get: (id) => providers.get(id),
          remove: (id) => { removed.push(id); providers.delete(id); },
          add: (input) => {
            const id = input.info.id;
            added.set(id, input);
            providers.set(id, { provider: input.info });
          },
        }),
      },
      tool: { transform: async (callback) => callback({ add: () => {}, namespace: () => {} }) },
      location: { directory: process.cwd() },
      auth: { set: async () => {} },
      aisdk: { hook: async () => {} },
    };
    await setup(ctx);
    assert.deepEqual(removed, ["google-antigravity", "antigravity"]);
    for (const id of removed) {
      assert.equal(added.get(id).info.package, "aisdk:@ai-sdk/google");
      assert.equal(added.get(id).models.length, 15);
    }
  });
});

describe("V2 credential resolution", () => {
  it("resolves active integration connection credential first", async () => {
    const { resolveV2Credential } = await import("../dist/auth/v2-credentials.js");
    const ctx = {
      integration: {
        connection: {
          active: async (id) => (id === "google-antigravity" ? { type: "credential", id: "c1" } : undefined),
          resolve: async () => ({
            type: "oauth",
            methodID: "oauth",
            access: "ya29.active-token",
            metadata: { projectId: "proj-active" },
          }),
        },
      },
    };
    const cred = await resolveV2Credential(ctx, "antigravity");
    assert.ok(cred);
    assert.equal(cred.access, "ya29.active-token");
    assert.equal(cred.metadata.projectId, "proj-active");
  });
});
