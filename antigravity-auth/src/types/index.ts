/**
 * TypeScript definitions for Google Antigravity OpenCode Plugin.
 */

export interface OAuthCredentials {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  enterpriseUrl?: string;
}

export interface AuthMeta {
  projectId?: string;
  email?: string;
  updatedAt?: number;
}

export interface PKCEResult {
  verifier: string;
  challenge: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface ModelLimit {
  context: number;
  output: number;
}

export interface ModelModalities {
  input: string[];
  output: string[];
}

export interface ModelCatalogEntry {
  name: string;
  limit: ModelLimit;
  reasoning: boolean;
  tool_call: boolean;
  modalities: ModelModalities;
  options?: Record<string, unknown>;
}

export type ThinkingLevel = "HIGH" | "MEDIUM" | "LOW" | "MINIMAL";

export interface ThinkingConfig {
  thinkingLevel?: string;
  includeThoughts?: boolean;
  thinkingBudget?: number;
}

export interface GenerationConfig {
  thinkingConfig?: ThinkingConfig;
  thinkingBudget?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  [key: string]: unknown;
}

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
    thoughtSignature?: string;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiContent {
  role: "user" | "model" | "system";
  parts: GeminiPart[];
}

export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  parametersJsonSchema?: Record<string, unknown>;
}

export interface ToolGroup {
  functionDeclarations?: FunctionDeclaration[];
  [key: string]: unknown;
}

export interface AntigravityEnvelopeRequest {
  contents?: GeminiContent[];
  tools?: ToolGroup[];
  generationConfig?: GenerationConfig;
  systemInstruction?: {
    role: string;
    parts: Array<{ text: string }>;
  };
  sessionId?: string;
  [key: string]: unknown;
}

export interface AntigravityEnvelope {
  project: string;
  model: string;
  request: AntigravityEnvelopeRequest;
  requestType?: "agent" | string;
  userAgent: "antigravity" | "opencode" | string;
  requestId: string;
}

export interface OpenCodePluginContext {
  client?: {
    auth?: {
      set?: (params: {
        path: { id: string };
        body: OAuthCredentials;
      }) => Promise<void>;
    };
  };
}

export interface OpenCodeAuthHook {
  provider: string;
  loader: (
    getAuth: () => Promise<OAuthCredentials | null>,
  ) => Promise<{ apiKey?: string; fetch?: typeof fetch }>;
  methods: Array<{
    type: string;
    label: string;
    authorize: () => Promise<{
      url: string;
      instructions: string;
      method: string;
      callback: () => Promise<
        | {
            type: "success";
            access: string;
            refresh: string;
            expires: number;
            accountId?: string;
            enterpriseUrl?: string;
          }
        | { type: "failed" }
      >;
    }>;
  }>;
}

export interface OpenCodePluginOutput {
  auth: OpenCodeAuthHook;
}

export interface AntigravityFetchDeps {
  getAccessToken: (opts?: { forceRefresh?: boolean }) => Promise<string>;
  getProjectId: () => Promise<string>;
  fetchImpl?: typeof fetch;
}
