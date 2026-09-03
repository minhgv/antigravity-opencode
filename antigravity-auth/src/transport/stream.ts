/**
 * SSE stream unwrapping & transformation for Cloud Code Assist responses.
 * Strips the outer Antigravity envelope `{ response: { candidates: [...] } }`
 * so @ai-sdk/google can parse chunks as native Gemini SSE.
 */

export function transformSseDataLine(line: string): string {
  const m = line.match(/^data:\s?(.*)$/);
  if (!m) return line;
  const jsonStr = m[1]?.trim() ?? "";
  if (!jsonStr || jsonStr === "[DONE]") {
    return line.startsWith("data:") ? line : `data: ${jsonStr}`;
  }
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object" && "response" in parsed && parsed.response != null) {
      return `data: ${JSON.stringify(parsed.response)}`;
    }
  } catch {
    // leave unmodified if JSON parsing fails
  }
  return line;
}

export function unwrapSseResponseStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.length) {
              const rest = buffer.replace(/\r$/, "");
              if (rest.startsWith("data:")) {
                controller.enqueue(encoder.encode(transformSseDataLine(rest) + "\n"));
              } else if (rest.trim()) {
                controller.enqueue(encoder.encode(rest));
              }
            }
            controller.close();
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          let out = "";
          for (const line of lines) {
            if (line.startsWith("data:")) {
              out += transformSseDataLine(line) + "\n";
            } else {
              out += line + "\n";
            }
          }
          if (out) {
            controller.enqueue(encoder.encode(out));
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        try {
          reader?.releaseLock();
        } catch {
          // ignore
        }
      }
    },
    async cancel(reason) {
      try {
        if (reader) {
          await reader.cancel(reason);
        } else {
          await body.cancel(reason);
        }
      } catch {
        /* ignore */
      }
    },
  });
}
