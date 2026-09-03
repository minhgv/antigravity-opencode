/**
 * Image generation module using Gemini Image models via Google Antigravity.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { DEFAULT_ENDPOINT, ENDPOINT_FALLBACKS } from "../auth/constants.js";
import { getAntigravityHeaders } from "../transport/envelope.js";
import { antigravityFetch } from "../utils/http.js";
import {
  IMAGE_ASPECT_RATIOS,
  type ImageAspectRatio,
  type GeneratedImage,
  type GenerateImageOptions,
  type GenerateImageResult,
} from "./types.js";

export const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image";
export const IMAGE_MODEL_FALLBACKS = [
  DEFAULT_IMAGE_MODEL,
  "gemini-3.1-flash-image",
  "gemini-3-pro-image-preview",
];

const IMAGE_SYSTEM_INSTRUCTION =
  "You are an AI image generator. Generate images based on user descriptions. Focus on creating high-quality, visually appealing images that match the user's request.";
const DEFAULT_IMAGE_DIR = join(".opencode", "generated-images");
const MAX_PROMPT_CHARS = 8000;

export function assertSafeImageModel(modelId: string): string {
  const id = modelId.trim();
  if (id.length === 0 || id.length > 80) {
    throw new Error("Unsupported image model id.");
  }
  if (!/^(gemini-[a-z0-9.+-]*image[a-z0-9.+-]*|imagen-[a-z0-9.+-]+)$/i.test(id)) {
    throw new Error(`Unsupported image model: ${id}`);
  }
  return id;
}

export function assertSafeAspectRatio(ratio: string): ImageAspectRatio {
  const value = ratio.trim();
  for (const allowed of IMAGE_ASPECT_RATIOS) {
    if (allowed === value) return allowed;
  }
  throw new Error(
    `Unsupported aspect ratio: ${value}. Use one of ${IMAGE_ASPECT_RATIOS.join(", ")}.`,
  );
}

function imageExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  return "png";
}

export function resolveImageSavePath(
  cwd: string,
  requested?: string,
  mimeType = "image/png",
  index?: number,
): string {
  const ext = imageExtension(mimeType);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = index === undefined ? "" : `-${index + 1}`;
  const defaultName = `image-${stamp}${suffix}.${ext}`;
  const root = resolve(cwd);
  const target = requested?.trim()
    ? resolve(root, requested.trim())
    : resolve(root, DEFAULT_IMAGE_DIR, defaultName);
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Image save path must be inside the working directory.");
  }
  if (!extname(target)) return join(target, defaultName);
  if (index === undefined) return target;
  const currentExt = extname(target);
  return `${target.slice(0, -currentExt.length)}${suffix}${currentExt}`;
}

export function buildImageGenerateRequest(
  prompt: string,
  model: string,
  projectId: string,
  aspectRatio: string,
) {
  const hex = randomBytes(4).toString("hex");
  return {
    project: projectId,
    model,
    request: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: {
        role: "user",
        parts: [{ text: IMAGE_SYSTEM_INSTRUCTION }],
      },
      generationConfig: {
        imageConfig: { aspectRatio },
        candidateCount: 1,
      },
    },
    requestType: "agent",
    userAgent: "antigravity",
    requestId: `agent-img-${Date.now()}-${hex}`,
  };
}

export async function collectImagesFromSse(
  response: Response,
  signal?: AbortSignal,
): Promise<{ images: GeneratedImage[]; text: string[] }> {
  if (!response.body) throw new Error("No response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const images: GeneratedImage[] = [];
  const text: string[] = [];

  try {
    while (true) {
      if (signal?.aborted) throw new Error("Request was aborted");
      const result = await reader.read();
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) continue;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json || json === "[DONE]") continue;
        let chunk: any;
        try {
          chunk = JSON.parse(json);
        } catch {
          continue;
        }

        if (chunk.error?.message) throw new Error(chunk.error.message);
        const responseData = chunk.response || chunk;
        for (const candidate of responseData.candidates || []) {
          for (const part of candidate.content?.parts || []) {
            if (part.text) text.push(part.text);
            if (part.inlineData?.data) {
              images.push({
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType || "image/png",
              });
            }
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  return { images, text };
}

export async function generateAntigravityImage(
  options: GenerateImageOptions,
): Promise<GenerateImageResult> {
  const prompt = options.prompt.trim();
  if (!prompt) throw new Error("Image prompt is required.");
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`Image prompt is too long (max ${MAX_PROMPT_CHARS} characters).`);
  }

  const aspectRatio = assertSafeAspectRatio(options.aspectRatio || "1:1");
  const preferred = assertSafeImageModel(options.model || DEFAULT_IMAGE_MODEL);
  const models = [preferred, ...IMAGE_MODEL_FALLBACKS.filter((id) => id !== preferred)];

  const headers = {
    ...getAntigravityHeaders(),
    Authorization: `Bearer ${options.accessToken}`,
    "Content-Type": "application/json",
  };

  const endpoints = [
    DEFAULT_ENDPOINT,
    ...ENDPOINT_FALLBACKS.filter((e) => e !== DEFAULT_ENDPOINT),
  ];

  let lastError = "no endpoint available";
  const cwd = options.cwd || process.cwd();

  for (const model of models) {
    const body = JSON.stringify(
      buildImageGenerateRequest(prompt, model, options.projectId, aspectRatio),
    );

    for (const endpoint of endpoints) {
      if (options.signal?.aborted) throw new Error("Request was aborted");
      try {
        const response = await antigravityFetch(
          `${endpoint}/v1internal:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers,
            body,
            signal: options.signal,
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          lastError = errText.slice(0, 300);
          if ([403, 404, 429, 500, 502, 503, 504].includes(response.status)) {
            continue;
          }
          throw new Error(`Antigravity image request failed (${response.status}): ${lastError}`);
        }

        const parsed = await collectImagesFromSse(response, options.signal);
        if (!parsed.images.length) {
          lastError = parsed.text.join(" ").trim() || "No image data returned from API.";
          continue;
        }

        const savedPaths: string[] = [];
        const many = parsed.images.length > 1;

        for (const [index, image] of parsed.images.entries()) {
          const savePath = resolveImageSavePath(
            cwd,
            options.path,
            image.mimeType,
            many ? index : undefined,
          );
          await mkdir(dirname(savePath), { recursive: true });
          await writeFile(savePath, Buffer.from(image.data, "base64"));
          savedPaths.push(savePath);
        }

        return {
          images: parsed.images,
          savedPaths,
          text: parsed.text,
          model,
        };
      } catch (err: any) {
        lastError = err?.message || String(err);
        if (options.signal?.aborted) {
          throw new Error("Request was aborted", { cause: err });
        }
      }
    }
  }

  throw new Error(`Antigravity image generation failed: ${lastError}`);
}
