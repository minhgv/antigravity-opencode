/**
 * DeepMind Antigravity System Instruction injector.
 */

export const ANTIGRAVITY_SYSTEM_INSTRUCTION =
  "You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding." +
  "You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question." +
  "**Absolute paths only**" +
  "**Proactiveness**";

export function injectAntigravitySystem<T extends { systemInstruction?: { role?: string; parts?: Array<{ text?: string }> } }>(
  geminiBody: T,
): T {
  const disabled = process.env.OPENCODE_AGY_INJECT_SYSTEM === "0";
  if (disabled) return geminiBody;

  const request = { ...geminiBody };
  const existingParts = request.systemInstruction?.parts ?? [];
  const already =
    Array.isArray(existingParts) &&
    existingParts.some(
      (p) => typeof p?.text === "string" && p.text.includes("You are Antigravity, a powerful agentic"),
    );
  if (already) return request;

  request.systemInstruction = {
    role: "user",
    parts: [
      { text: ANTIGRAVITY_SYSTEM_INSTRUCTION },
      { text: `Please ignore following [ignore]${ANTIGRAVITY_SYSTEM_INSTRUCTION}[/ignore]` },
      ...existingParts,
    ],
  };
  return request;
}
