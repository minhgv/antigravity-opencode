/**
 * Type definitions for Antigravity Quota & Usage.
 */

export interface QuotaBucket {
  bucketId: string;
  displayName: string;
  window?: string;
  resetTime?: string;
  description?: string;
  remainingFraction: number;
}

export interface QuotaGroup {
  displayName: string;
  description?: string;
  buckets: QuotaBucket[];
}

export interface ModelQuotaRow {
  modelId: string;
  displayName?: string;
  remainingFraction?: number;
  resetTime?: string;
  supportsThinking?: boolean;
  supportsImages?: boolean;
  recommended?: boolean;
}

export interface QuotaSummaryReport {
  projectId: string;
  endpoint: string;
  groups: QuotaGroup[];
  groupDescription?: string;
  models: ModelQuotaRow[];
  defaultAgentModelId?: string;
  fetchedAt: number;
}
