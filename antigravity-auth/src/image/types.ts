/**
 * Type definitions for Antigravity Image Generation.
 */

export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export interface GeneratedImage {
  data: string; // base64
  mimeType: string;
}

export interface GenerateImageOptions {
  prompt: string;
  accessToken: string;
  projectId: string;
  cwd?: string;
  aspectRatio?: ImageAspectRatio | string;
  model?: string;
  path?: string;
  signal?: AbortSignal;
}

export interface GenerateImageResult {
  images: GeneratedImage[];
  savedPaths: string[];
  text: string[];
  model: string;
}
