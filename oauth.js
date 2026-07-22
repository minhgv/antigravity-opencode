/**
 * Antigravity OAuth — ported from OpenClaw pi-ai google-antigravity.js
 * (behavior only; no third-party incomplete repos).
 */
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";

const decode = (s) => Buffer.from(s, "base64").toString("utf8");

// Same embedded client credentials as OpenClaw pi-ai Antigravity module
export const CLIENT_ID = decode(
  "",
);
export const CLIENT_SECRET = decode("");

export const REDIRECT_URI = "http://localhost:51121/oauth-callback";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

export const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

export function generatePKCE() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl({ challenge, state, redirectUri = REDIRECT_URI }) {
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

/**
 * @param {string} code
 * @param {string} verifier
 * @param {string} [redirectUri]
 */
export async function exchangeCode(code, verifier, redirectUri = REDIRECT_URI) {
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
  return response.json();
}

/**
 * @param {string} refreshToken
 */
export async function refreshAccessToken(refreshToken) {
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
  return response.json();
}

export async function getUserEmail(accessToken) {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = await response.json();
      return data.email;
    }
  } catch {
    // optional
  }
  return undefined;
}

/**
 * Discover Cloud AI Companion project (OpenClaw loadCodeAssist flow)
 * @param {string} accessToken
 */
export async function discoverProject(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "google-api-nodejs-client/9.15.1",
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": JSON.stringify({
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    }),
  };
  const endpoints = [
    "https://cloudcode-pa.googleapis.com",
    "https://daily-cloudcode-pa.sandbox.googleapis.com",
  ];
  const body = JSON.stringify({
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  });

  for (const endpoint of endpoints) {
    try {
      const loadResponse = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers,
        body,
      });
      if (!loadResponse.ok) continue;
      const data = await loadResponse.json();
      if (typeof data.cloudaicompanionProject === "string" && data.cloudaicompanionProject) {
        return data.cloudaicompanionProject;
      }
      if (
        data.cloudaicompanionProject &&
        typeof data.cloudaicompanionProject === "object" &&
        data.cloudaicompanionProject.id
      ) {
        return data.cloudaicompanionProject.id;
      }
    } catch {
      // try next
    }
  }
  return DEFAULT_PROJECT_ID;
}

/**
 * Local callback server for OAuth (OpenClaw port 51121)
 * @returns {Promise<{ waitForCode: () => Promise<{code:string,state:string}|null>, close: () => void }>}
 */
export function startCallbackServer(port = 51121, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    let settle;
    const waitForCodePromise = new Promise((resolveWait) => {
      let settled = false;
      settle = (value) => {
        if (settled) return;
        settled = true;
        resolveWait(value);
      };
    });

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
        close: () => server.close(),
      });
    });
  });
}

/**
 * Full login used by AuthHook method:auto
 */
export async function loginAntigravity() {
  const { verifier, challenge } = generatePKCE();
  const server = await startCallbackServer();
  try {
    const url = buildAuthUrl({ challenge, state: verifier });
    return {
      url,
      instructions: "Complete Google Antigravity sign-in in your browser. This window will close automatically.",
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
            // stash projectId+email for loader via accountId convention is weak;
            // caller must also write sidecar. We put projectId in accountId as backup.
            accountId: projectId,
            enterpriseUrl: email ? `mailto:${email}` : undefined,
            // extra fields for plugin-local use before return is stored
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

/**
 * Normalize refresh result for OpenCode auth storage
 */
export function toExpires(expiresInSec) {
  return Date.now() + expiresInSec * 1000 - 5 * 60 * 1000;
}
