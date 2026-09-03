# Google Antigravity Auth Plugin for OpenCode

Plugin tích hợp xác thực **Google Antigravity OAuth** và **Cloud Code Assist API** trực tiếp vào **OpenCode** (v1.14+).

Plugin cho phép sử dụng toàn bộ các mô hình **Gemini (Flash, Pro, Thinking)** thông qua tài khoản Google Antigravity mà **không cần API Key** và **không bị gãy Tool Calls** (do giữ nguyên native Gemini schema qua `@ai-sdk/google`).

```
antigravity-opencode/
├── install.sh            # Cài đặt và build tự động (agent/CLI chạy được)
├── antigravity-auth/     # Mã nguồn plugin (TypeScript Native)
│   ├── src/
│   │   ├── auth/         # OAuth PKCE, credentials, store, account
│   │   ├── client/       # Cloud Code Assist client, sessions, request builders
│   │   ├── models/       # Model catalog, thinking levels, tool call mappings
│   │   ├── stream/       # SSE streaming & unwrap, OpenAPI schema dereferencer
│   │   ├── transport/    # Custom fetch for @ai-sdk/google, undici pool, prewarm
│   │   ├── types/        # TypeScript type definitions
│   │   └── plugin.ts     # OpenCode plugin entry point (dual provider)
│   ├── plugin.js         # Entry point re-exporting dist/plugin.js
│   ├── package.json
│   ├── tsconfig.json
│   └── test/
└── README.md             # Tài liệu này
```

---

## 📋 1. Yêu cầu Tiền đề (Prerequisites) trên máy mới

1. **Node.js**: Phiên bản 18+ (khuyên dùng Node 20 hoặc 22+).
2. **OpenCode CLI**: Phiên bản 1.14.0 trở lên.
   - Kiểm tra: `opencode --version`
   - Cài đặt OpenCode (nếu chưa có): `npm install -g opencode-ai` hoặc `bun add -g opencode-ai`
3. **Mạng Internet**: Cổng local `51121` không bị chiếm dụng (dùng cho trình duyệt OAuth callback).

---

## 🚀 2. Cài đặt

### Cách A: Cài đặt tự động (khuyên dùng — agent/CLI chạy được)

Chỉ cần chạy một lệnh. Script idempotent (chạy lại an toàn), tự copy plugin + merge `opencode.json` không ghi đè config hiện có:

```bash
bash install.sh
```

Hoặc từ thư mục khác:

```bash
bash /path/to/antigravity-opencode/install.sh
```

**Tùy chọn:**
```bash
OPENCODE_AGY_SKIP_CONFIG=1 bash install.sh   # chỉ copy files, không đụng config
```

### Cách B: Cài đặt thủ công

**Bước 1:** Tạo thư mục plugin:
```bash
mkdir -p ~/.config/opencode/plugins/antigravity-auth
```

**Bước 2:** Copy 5 files mã nguồn từ `antigravity-auth/`:
```bash
cp plugin.js oauth.js transport.js store.js package.json ~/.config/opencode/plugins/antigravity-auth/
```

**Bước 3:** Thêm vào `~/.config/opencode/opencode.json` (tạo mới nếu chưa có):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./plugins/antigravity-auth/plugin.js"
  ],
  "provider": {
    "google-antigravity": {
      "name": "Google Antigravity",
      "npm": "@ai-sdk/google",
      "models": {
        "gemini-3.8-flash": {
          "name": "Gemini 3.8 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.8-flash-high": {
          "name": "Gemini 3.8 Flash (High) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.8-flash-medium": {
          "name": "Gemini 3.8 Flash (Medium) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.8-flash-low": {
          "name": "Gemini 3.8 Flash (Low) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.7-flash-high": {
          "name": "Gemini 3.7 Flash (High) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.7-flash-medium": {
          "name": "Gemini 3.7 Flash (Medium) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.7-flash-low": {
          "name": "Gemini 3.7 Flash (Low) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-pro-agent": {
          "name": "Gemini 3.1 Pro (High) (Antigravity)",
          "limit": { "context": 1048576, "output": 65535 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.1-pro-high": {
          "name": "Gemini 3.1 Pro High (→ gemini-pro-agent)",
          "limit": { "context": 1048576, "output": 65535 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.1-pro-low": {
          "name": "Gemini 3.1 Pro (Low) (Antigravity)",
          "limit": { "context": 1048576, "output": 65535 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.6-flash-high": {
          "name": "Gemini 3.6 Flash (High) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.6-flash-medium": {
          "name": "Gemini 3.6 Flash (Medium) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": false,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.6-flash-low": {
          "name": "Gemini 3.6 Flash (Low) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": false,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3-flash-agent": {
          "name": "Gemini 3.5 Flash (High) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.5-flash-low": {
          "name": "Gemini 3.5 Flash (Medium) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.5-flash-extra-low": {
          "name": "Gemini 3.5 Flash (Low) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.5-flash-lite": {
          "name": "Gemini 3.5 Flash-Lite (Antigravity)",
          "limit": { "context": 1048576, "output": 65535 },
          "reasoning": false,
          "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] }
        },
        "gemini-3-flash": {
          "name": "Gemini 3 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "gemini-3.1-flash-lite": {
          "name": "Gemini 3.1 Flash Lite (Antigravity)",
          "limit": { "context": 1048576, "output": 65535 },
          "reasoning": false,
          "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] }
        },
        "gemini-3.1-flash-image": {
          "name": "Gemini 3.1 Flash Image (Antigravity)",
          "limit": { "context": 1000000, "output": 64000 },
          "reasoning": false,
          "tool_call": true,
          "modalities": { "input": ["text"], "output": ["text"] }
        }
      }
    }
  }
}
```

> **Ghi chú:** Khối config trên (cũng chính là default `install.sh` merge) đăng ký đầy đủ **16 mô hình** (khớp catalog mục 9). Không cần dùng hết thì tự xóa bớt entry — model id nào nằm trong `provider.google-antigravity.models` mới hiện khi chạy `opencode models google-antigravity`.

---

## 🔑 3. Đăng nhập và Xác thực OAuth

Sau khi hoàn tất cấu hình:

1. Chạy lệnh đăng nhập trong Terminal:
   ```bash
   opencode auth login
   ```
2. Danh sách các Provider sẽ hiển thị. Chọn **`Google Antigravity (browser)`**.
3. Trình duyệt web sẽ tự động mở trang đăng nhập Google. Hãy đăng nhập tài khoản Google Antigravity của bạn và bấm **Cho phép (Allow)**.
4. Trình duyệt hiển thị thông báo thành công: *"Google Antigravity authentication completed. You can close this window and return to OpenCode."*
5. Quay lại Terminal, OpenCode xác nhận đã lưu thông tin xác thực vào `~/.local/share/opencode/auth.json`.

---

## 🧪 4. Kiểm tra & Sử dụng

### Kiểm tra danh sách mô hình đã nạp:
```bash
opencode models google-antigravity
```

### Chạy OpenCode với mô hình Antigravity:
```bash
opencode
```
Trong giao diện TUI, chọn mô hình: `google-antigravity/gemini-3.7-flash-high` (mới nhất), `google-antigravity/gemini-3-flash` hoặc `google-antigravity/gemini-pro-agent`.

---

## ⚙️ 5. Biến Môi trường Tùy chỉnh (Tùy chọn)

- `OPENCODE_AGY_INJECT_SYSTEM=0`: Tắt tự động thêm System Prompt Antigravity mặc định.
- `PI_AI_ANTIGRAVITY_VERSION`: Ghi đè phiên bản User-Agent Antigravity (mặc định theo mode).
- `OPENCODE_AGY_UA_MODE`: Chế độ User-Agent. Giá trị:
  - `cli` (mặc định): `antigravity/cli/<ver> (aidev_client; os_type=...; arch=...; auth_method=consumer)` (mặc định `1.1.13`) — **bắt buộc để backend cấp model mới nhất (gemini-3.7-flash); UA `sdk`/`desktop` bị backend trả 404**
  - `sdk`: `antigravity/<ver> <platform>/<arch>` (mặc định `1.21.9`)
  - `desktop`: `Antigravity/<ver> <platform>/<arch>` (mặc định `2.2.1`)
- `OPENCODE_AGY_DEBUG=1`: Bật ghi log chi tiết request/response vào thư mục tạm `/tmp/agy-debug-*.json` khi gặp lỗi 400/500. Log tự động loại bỏ token/nội dung nhạy cảm — chỉ ghi `status`, `modelId`, `endpoint`, `envelopeKeys`, `generationConfig`, `toolsCount`, `contentsRoles`.

---

## 🔒 6. Lưu ý Bảo mật & Khắc phục Lỗi

1. **Phân quyền Tệp Sidecar**: Plugin tự động lưu mã `projectId` và `email` vào `~/.config/opencode/google-antigravity-meta.json` với quyền bảo mật `0600` (chỉ user sở hữu đọc/ghi).
2. **Auto-discover ProjectId**: Khi chưa có `projectId`, plugin tự gọi `v1internal:loadCodeAssist` lên Cloud Code Assist API để xin project `cloudaicompanionProject`. Nếu thất bại, dùng fallback `rising-fact-p41fc`.
3. **Single-flight Refresh Lock**: Khi nhiều tool/stream request chạy song song cùng hết hạn token, chỉ một request refresh duy nhất được thực hiện (`refreshInFlight`), các request còn lại đợi chung kết quả — tránh stampede lên Google token endpoint.
4. **Unofficial Provider**: Antigravity OAuth là tích hợp không chính thức (Unofficial). Khuyên dùng tài khoản cá nhân/non-critical.
5. **Sự cố Lỗi 400 (INVALID_ARGUMENT)**:
   - Đảm bảo chọn đúng mô hình `google-antigravity/gemini-pro-agent` thay vì tên alias cũ.
   - Plugin tự xóa `thinkingBudget` (gây lỗi 400 trên Gemini 3) và chuyển sang `thinkingLevel` (`HIGH`/`LOW`/`MINIMAL`) theo model id.
   - Nếu vẫn lỗi, bật `OPENCODE_AGY_DEBUG=1` để inspect envelope, hoặc chạy `opencode auth logout` rồi đăng nhập lại bằng `opencode auth login`.
6. **⚠️ Gemini 3.7 Flash — `thinkingLevel: MINIMAL` không được hỗ trợ**:
   - Backend Antigravity trả **HTTP 400** `Thinking level MINIMAL is not supported for this model` cho toàn bộ `gemini-3.7-flash-*` (high/medium/low). Các model `gemini-3.6-flash-*` trở xuống vẫn chấp nhận MINIMAL.
   - Triệu chứng: stream im lặng — thường là luồng *title/compact* (log có `stream error ... Thinking level MINIMAL is not supported` tại `~/.local/share/opencode/log/opencode.log`) hoặc không ra câu trả lời cuối sau vòng tool call.
   - **Plugin đã tự xử lý** (không cần cấu hình): `sanitizeGenerationConfig` tự floor `MINIMAL` → `LOW` cho gemini-3.7+ qua helper `isMinimalThinkingSupported()` (transport.js). `LOW`/`MEDIUM`/`HIGH` đều được backend chấp nhận.
   - Nếu bạn tự set `thinkingLevel: "MINIMAL"` trong `generationConfig` cho model 3.7, hãy đổi sang `LOW`/`MEDIUM`/`HIGH`.
7. **Quota `Resource has been exhausted` khi dùng Gemini 3.7 nặng**: dùng 3.7 liên tục nhiều vòng tool call có thể bị backend rate-limit (`Resource has been exhausted (e.g. check quota)`) ngay sau tool call → stream im lặng. Plugin đã retry HTTP 429/5xx với backoff, nhưng nếu quota kéo dài vẫn lỗi — hãy giãn nhịp dùng hoặc chuyển model khác.

---

## 🧪 7. Chạy Unit Tests (Dành cho Developer)

```bash
node --test test/*.test.js
```
*(Bộ 26/26 unit tests phải pass. Cover: PKCE, OAuth URL, envelope wrapping, tool adapter & schema sanitization, thinkingLevel mapping (incl. 3.7 MINIMAL→LOW floor), UA cli/sdk/desktop, SSE unwrap CRLF/LF, custom fetch v1internal rewrite, model catalog, sidecar 0600).*

---

## 🏗️ 8. Kiến trúc Transport & Độ ổn định (Transport Internals)

Plugin không đơn thuần thay API key — nó **chặn toàn bộ tầng fetch** của `@ai-sdk/google` để ngụy trang request thành giao thức nguyên bản của Antigravity:

### Luồng xử lý Request
```
@ai-sdk/google  →  createAntigravityFetch (transport.js)
                   ├─ 1. resolveWireModelId(): alias `gemini-3.1-pro-high` → `gemini-pro-agent`
                   ├─ 2. postProcessGeminiBody(): sanitize tools & schema, inject thoughtSignature (Gemini 3)
                   ├─ 3. sanitizeGenerationConfig(): xóa thinkingBudget, set thinkingLevel HIGH/LOW/MINIMAL (gemini-3.7+ tự floor MINIMAL→LOW)
                   ├─ 4. injectAntigravitySystem(): chèn DeepMind System Instruction
                   ├─ 5. buildEnvelope(): wrap outer envelope {project, model, request, requestType, userAgent, requestId}
                   ├─ 6. getAntigravityHeaders(): User-Agent (cli/sdk/desktop mode)
                   └─ 7. POST → /v1internal:streamGenerateContent?alt=sse
                                       ↓
                   unwrapSseResponseStream(): data: {"response": {...}} → data: {...}
```

### Endpoint Fallback Chain
Code thử lần lượt 3 endpoint Google (bắt đầu từ sandbox daily, fallback khi gặp 403/404):
1. `https://daily-cloudcode-pa.sandbox.googleapis.com` (thử trước tiên)
2. `https://autopush-cloudcode-pa.sandbox.googleapis.com`
3. `https://cloudcode-pa.googleapis.com` (production — `DEFAULT_ENDPOINT`, fallback cuối)

Khi gặp HTTP 403/404 từ một endpoint, tự động chuyển endpoint tiếp theo.

### Retry & Backoff
- `MAX_RETRIES = 3` cho HTTP 429 và 5xx.
- Backoff exponentially: `BASE_DELAY_MS * 2^attempt` (1s → 2s → 4s), cap `60_000ms`.
- Parse `Retry-After` header (seconds / HTTP-date) và `x-ratelimit-reset-after`.
- Parse error body cho `reset after 30s`, `Please retry in 2.5s`, `"retryDelay": "500ms"`.
- HTTP 401 → trigger single-flight refresh token, không tính vào retry budget.

### Ngụy trang 5 Vectơ Phát hiện
Để Google không flag request là unofficial client:
1. **User-Agent** + platform/arch động (`darwin/arm64`, `windows/amd64`, `linux/amd64`).
2. **Outer Envelope** đúng đặc tả Antigravity (`requestType: "agent"`, `userAgent: "antigravity"`).
3. **System Instruction** DeepMind prefix chèn đầu `systemInstruction.parts[0]`.
4. **GenerationConfig sanitize**: ép `thinkingLevel` enum thay vì `thinkingBudget` number.
5. **SSE incremental unwrap**: xử lý chuẩn CRLF (`\r\n`) + LF (`\n`), không buffer toàn stream.

---

## 📚 9. Danh mục Mô hình (Full Model Catalog)

Plugin đăng ký 20 mô hình trong `ANTIGRAVITY_MODEL_CATALOG` (transport.js), phân theo từng dòng thế hệ:

### 🚀 Dòng Gemini 3.8 Flash (Sẵn sàng đón đầu)
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 1 | `gemini-3.8-flash` | `gemini-3.8-flash` | `LOW` | 1M / 64k | text, image |
| 2 | `gemini-3.8-flash-high` | `gemini-3.8-flash-high` | `HIGH` | 1M / 64k | text, image |
| 3 | `gemini-3.8-flash-medium` | `gemini-3.8-flash-medium` | `MEDIUM` | 1M / 64k | text, image |
| 4 | `gemini-3.8-flash-low` | `gemini-3.8-flash-low` | `LOW` | 1M / 64k | text, image |

### 🌟 Dòng Gemini 3.7 Flash (Thinking mặc định)
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 5 | `gemini-3.7-flash-high` | `gemini-3.7-flash-high` | `HIGH` | 1M / 64k | text, image |
| 6 | `gemini-3.7-flash-medium` | `gemini-3.7-flash-medium` | `MEDIUM` | 1M / 64k | text, image |
| 7 | `gemini-3.7-flash-low` | `gemini-3.7-flash-low` | `LOW` | 1M / 64k | text, image |

### 🧠 Dòng Gemini 3.1 Pro (Agentic Coding & Suy luận sâu)
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 8 | `gemini-pro-agent` | `gemini-pro-agent` | `HIGH` | 1M / 64k | text, image |
| 9 | `gemini-3.1-pro-high` | `gemini-pro-agent` *(alias)* | `HIGH` | 1M / 64k | text, image |
| 10 | `gemini-3.1-pro-low` | `gemini-3.1-pro-low` | `LOW` | 1M / 64k | text, image |

### ⚡ Dòng Gemini 3.6 Flash
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 11 | `gemini-3.6-flash-high` | `gemini-3.6-flash-high` | `HIGH` | 1M / 64k | text, image |
| 12 | `gemini-3.6-flash-medium` | `gemini-3.6-flash-medium` | *Tắt (false)* | 1M / 64k | text, image |
| 13 | `gemini-3.6-flash-low` | `gemini-3.6-flash-low` | *Tắt (false)* | 1M / 64k | text, image |

### 🚀 Dòng Gemini 3.5 Flash
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 14 | `gemini-3-flash-agent` | `gemini-3-flash-agent` | `HIGH` | 1M / 64k | text, image |
| 15 | `gemini-3.5-flash-low` | `gemini-3.5-flash-low` | `MEDIUM` | 1M / 64k | text, image |
| 16 | `gemini-3.5-flash-extra-low` | `gemini-3.5-flash-extra-low` | `LOW` | 1M / 64k | text, image |
| 17 | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | *Tắt (false)* | 1M / 64k | text |

### 🎯 Dòng Gemini 3 Flash & 3.1 Flash Phụ trợ
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 18 | `gemini-3-flash` | `gemini-3-flash` | `MINIMAL` | 1M / 64k | text, image |
| 19 | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | *Tắt (false)* | 1M / 64k | text |
| 20 | `gemini-3.1-flash-image` | `gemini-3.1-flash-image` | *Tắt (false)* | 1M / 64k | text |
