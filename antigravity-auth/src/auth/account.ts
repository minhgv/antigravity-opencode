/**
 * Project discovery and account inspection for Google Antigravity.
 */
import { DEFAULT_PROJECT_ID, DEFAULT_ENDPOINT, ANTIGRAVITY_DAILY } from "./constants.js";

export async function getUserEmail(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = (await response.json()) as { email?: string };
      return data.email;
    }
  } catch {
    // optional
  }
  return undefined;
}

/**
 * Discover Cloud AI Companion project via loadCodeAssist
 */
export async function discoverProject(accessToken: string): Promise<string> {
  const headers: Record<string, string> = {
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
  const endpoints = [DEFAULT_ENDPOINT, ANTIGRAVITY_DAILY];
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
      const data = (await loadResponse.json()) as {
        cloudaicompanionProject?: string | { id?: string };
      };
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
      // try next endpoint
    }
  }
  return DEFAULT_PROJECT_ID;
}
