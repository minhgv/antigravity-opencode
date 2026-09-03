/**
 * Quota & Usage inspector for Google Antigravity.
 * Interrogates Cloud Code Assist internal endpoints to track shared quota pools.
 */
import { DEFAULT_ENDPOINT, ENDPOINT_FALLBACKS } from "../auth/constants.js";
import { getAntigravityHeaders } from "../transport/envelope.js";
import { antigravityFetch } from "../utils/http.js";
import type {
  QuotaBucket,
  QuotaGroup,
  ModelQuotaRow,
  QuotaSummaryReport,
} from "./types.js";

function clampFraction(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function remainingPercent(remaining?: number): number | undefined {
  if (remaining === undefined) return undefined;
  return Math.round(remaining * 1000) / 10;
}

export function formatProgressBar(remaining?: number, width = 20): string {
  if (remaining === undefined) return `[${"?".repeat(width)}]`;
  const filled = Math.max(0, Math.min(width, Math.round(remaining * width)));
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

export function formatResetTime(resetTime?: string): string {
  if (!resetTime) return "n/a";
  const ts = Date.parse(resetTime);
  if (!Number.isFinite(ts)) return resetTime;
  const delta = ts - Date.now();
  if (delta <= 0) return "now";
  const totalMin = Math.round(delta / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export async function fetchUserQuotaSummary(
  token: string,
): Promise<{ endpoint: string; groups: QuotaGroup[]; description?: string }> {
  const headers = {
    ...getAntigravityHeaders(),
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const endpoints = [
    DEFAULT_ENDPOINT,
    ...ENDPOINT_FALLBACKS.filter((e) => e !== DEFAULT_ENDPOINT),
  ];

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    try {
      const res = await antigravityFetch(`${endpoint}/v1internal:retrieveUserQuotaSummary`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        continue;
      }

      const json = (await res.json()) as {
        groups?: Array<{
          displayName?: string;
          description?: string;
          buckets?: Array<{
            bucketId?: string;
            displayName?: string;
            window?: string;
            resetTime?: string;
            description?: string;
            remainingFraction?: number;
          }>;
        }>;
        description?: string;
      };

      const groups: QuotaGroup[] = [];
      for (const group of json.groups || []) {
        const buckets: QuotaBucket[] = [];
        for (const bucket of group.buckets || []) {
          const remaining = clampFraction(bucket.remainingFraction);
          if (remaining === undefined && !bucket.bucketId) continue;
          buckets.push({
            bucketId: String(bucket.bucketId || bucket.displayName || "unknown"),
            displayName: String(bucket.displayName || bucket.bucketId || "Limit"),
            window: bucket.window ? String(bucket.window) : undefined,
            resetTime: bucket.resetTime ? String(bucket.resetTime) : undefined,
            description: bucket.description ? String(bucket.description) : undefined,
            remainingFraction: remaining ?? 0,
          });
        }
        if (!buckets.length && !group.displayName) continue;
        groups.push({
          displayName: String(group.displayName || "Quota group"),
          description: group.description ? String(group.description) : undefined,
          buckets,
        });
      }

      return { endpoint, groups, description: json.description };
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to retrieve user quota summary from all endpoints");
}

export async function fetchAvailableModelsWithQuota(
  token: string,
  projectId: string,
): Promise<{ models: ModelQuotaRow[]; defaultAgentModelId?: string }> {
  const headers = {
    ...getAntigravityHeaders(),
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const endpoints = [
    DEFAULT_ENDPOINT,
    ...ENDPOINT_FALLBACKS.filter((e) => e !== DEFAULT_ENDPOINT),
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await antigravityFetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers,
        body: JSON.stringify({ project: projectId }),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as {
        models?: Record<
          string,
          {
            displayName?: string;
            quotaInfo?: {
              remainingFraction?: number;
              resetTime?: string;
            };
            supportsThinking?: boolean;
            supportsImages?: boolean;
            recommended?: boolean;
            isInternal?: boolean;
          }
        >;
        defaultAgentModelId?: string;
      };

      const models: ModelQuotaRow[] = [];
      const modelsObj = data.models || {};

      for (const [modelId, info] of Object.entries(modelsObj)) {
        if (!info || info.isInternal || modelId.startsWith("chat_")) continue;
        const qi = info.quotaInfo || {};
        models.push({
          modelId,
          displayName: info.displayName || modelId,
          remainingFraction: clampFraction(qi.remainingFraction),
          resetTime: qi.resetTime ? String(qi.resetTime) : undefined,
          supportsThinking: !!info.supportsThinking,
          supportsImages: !!info.supportsImages,
          recommended: !!info.recommended,
        });
      }

      models.sort((a, b) => a.modelId.localeCompare(b.modelId));
      return { models, defaultAgentModelId: data.defaultAgentModelId };
    } catch {
      // try next
    }
  }

  return { models: [] };
}

export async function fetchFullQuotaReport(
  token: string,
  projectId: string,
): Promise<QuotaSummaryReport> {
  const [summaryRes, modelsRes] = await Promise.all([
    fetchUserQuotaSummary(token).catch((err) => ({
      endpoint: DEFAULT_ENDPOINT,
      groups: [],
      description: err?.message || String(err),
    })),
    fetchAvailableModelsWithQuota(token, projectId).catch(() => ({
      models: [],
      defaultAgentModelId: undefined,
    })),
  ]);

  return {
    projectId,
    endpoint: summaryRes.endpoint,
    groups: summaryRes.groups,
    groupDescription: summaryRes.description,
    models: modelsRes.models,
    defaultAgentModelId: modelsRes.defaultAgentModelId,
    fetchedAt: Date.now(),
  };
}

export function formatQuotaReport(report: QuotaSummaryReport, opts?: { showModels?: boolean }): string {
  const lines: string[] = [];

  lines.push(`================================================================`);
  lines.push(`📊 Google Antigravity Quota Status (Project: ${report.projectId})`);
  lines.push(`Endpoint: ${report.endpoint}`);
  lines.push(`================================================================`);

  if (!report.groups.length) {
    lines.push(`⚠️ Không lấy được thông tin Quota Group (${report.groupDescription || "Chưa có thông tin"}).`);
  } else {
    for (const group of report.groups) {
      lines.push(`\n🔹 ${group.displayName}`);
      if (group.description) lines.push(`   (${group.description})`);
      for (const bucket of group.buckets) {
        const rem = remainingPercent(bucket.remainingFraction);
        const bar = formatProgressBar(bucket.remainingFraction);
        const resetStr = formatResetTime(bucket.resetTime);
        const label = bucket.displayName.padEnd(26);
        lines.push(`   ${bar} ${label} : ${rem !== undefined ? `${rem}%`.padStart(5) : "  ?%"} còn lại (Reset: ${resetStr})`);
      }
    }
  }

  if (opts?.showModels && report.models.length > 0) {
    lines.push(`\n----------------------------------------------------------------`);
    lines.push(`🤖 Chi tiết từng Mô hình trong Quota Pool:`);
    lines.push(`----------------------------------------------------------------`);
    const activeModels = report.models.filter((m) => !m.modelId.startsWith("tab_"));
    const maxLen = Math.max(...activeModels.map((m) => m.modelId.length), 10);

    for (const m of activeModels) {
      const rem = remainingPercent(m.remainingFraction);
      const remStr = rem !== undefined ? `${rem}%`.padStart(5) : "    ?";
      const resetStr = formatResetTime(m.resetTime).padEnd(8);
      const flags: string[] = [];
      if (m.recommended) flags.push("★ Recommended");
      if (m.supportsThinking) flags.push("Thinking");
      if (m.supportsImages) flags.push("Images");
      const flagStr = flags.length ? `[${flags.join(", ")}]` : "";
      lines.push(`   ${m.modelId.padEnd(maxLen)} | ${remStr} còn lại | Reset: ${resetStr} ${flagStr}`);
    }
  }

  lines.push(`================================================================\n`);
  return lines.join("\n");
}
