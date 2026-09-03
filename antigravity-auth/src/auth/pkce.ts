/**
 * Antigravity OAuth PKCE flow & callback server.
 */
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  AUTH_URL,
  TOKEN_URL,
  SCOPES,
} from "./constants.js";
import { getUserEmail, discoverProject } from "./account.js";
import type { PKCEResult, TokenResponse } from "../types/index.js";

export function generatePKCE(): PKCEResult {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl({
  challenge,
  state,
  redirectUri = REDIRECT_URI,
}: {
  challenge: string;
  state: string;
  redirectUri?: string;
}): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri = REDIRECT_URI,
): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  return (await response.json()) as TokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Antigravity token refresh failed: ${error}`);
  }
  return (await response.json()) as TokenResponse;
}

export interface CallbackServer {
  waitForCode: () => Promise<{ code: string; state: string } | null>;
  close: () => void;
}

export function startCallbackServer(port = 51121, host = "127.0.0.1"): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    let settle: (value: { code: string; state: string } | null) => void;
    const waitForCodePromise = new Promise<{ code: string; state: string } | null>(
      (resolveWait) => {
        let settled = false;
        settle = (value) => {
          if (settled) return;
          settled = true;
          resolveWait(value);
        };
      },
    );

    const server = createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost:${port}`);
      if (url.pathname === "/oauth-callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<html><body><h1>Auth error</h1><p>${error}</p></body></html>`);
          settle(null);
          return;
        }
        if (code && state) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<html><body><h1>Google Antigravity authentication completed</h1><p>You can close this window and return to OpenCode.</p></body></html>",
          );
          settle({ code, state });
        } else {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><h1>Missing code or state</h1></body></html>");
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.on("error", reject);
    server.listen(port, host, () => {
      resolve({
        waitForCode: () => waitForCodePromise,
        close: () => {
          settle(null);
          try {
            server.close();
            (server as any).closeAllConnections?.();
          } catch {
            // best-effort
          }
        },
      });
    });
  });
}

export interface LoginResult {
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
        _projectId?: string;
        _email?: string;
      }
    | { type: "failed" }
  >;
}

export async function loginAntigravity(): Promise<LoginResult> {
  const { verifier, challenge } = generatePKCE();
  const server = await startCallbackServer();
  try {
    const url = buildAuthUrl({ challenge, state: verifier });
    return {
      url,
      instructions:
        "Complete Google Antigravity sign-in in your browser. This window will close automatically.",
      method: "auto",
      callback: async () => {
        try {
          const result = await server.waitForCode();
          if (!result?.code) return { type: "failed" };
          if (result.state !== verifier) {
            throw new Error("OAuth state mismatch - possible CSRF attack");
          }
          const tokenData = await exchangeCode(result.code, verifier);
          if (!tokenData.refresh_token) {
            throw new Error("No refresh token received. Please try again.");
          }
          const email = await getUserEmail(tokenData.access_token);
          const projectId = await discoverProject(tokenData.access_token);
          const expires = Date.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000;
          return {
            type: "success",
            access: tokenData.access_token,
            refresh: tokenData.refresh_token,
            expires,
            accountId: projectId,
            enterpriseUrl: email ? `mailto:${email}` : undefined,
            _projectId: projectId,
            _email: email,
          };
        } finally {
          server.close();
        }
      },
    };
  } catch (err) {
    server.close();
    throw err;
  }
}

export function toExpires(expiresInSec: number): number {
  return Date.now() + expiresInSec * 1000 - 5 * 60 * 1000;
}
