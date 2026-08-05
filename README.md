# Google Antigravity Auth Plugin for OpenCode

Plugin tích hợp xác thực **Google Antigravity OAuth** và **Cloud Code Assist API** trực tiếp vào **OpenCode** (v1.14+).

Plugin cho phép sử dụng toàn bộ các mô hình Gemini, Claude (Thinking), và GPT-OSS thông qua tài khoản Google Antigravity mà **không cần API Key** và **không bị gãy Tool Calls** (do giữ nguyên native Gemini schema qua `@ai-sdk/google`).

---

## 📋 1. Yêu cầu Tiền đề (Prerequisites) trên máy mới

Trước khi cài đặt, hãy đảm bảo máy tính đã trang bị các công cụ sau:

1. **Node.js**: Phiên bản 18+ (khuyên dùng Node 20 hoặc 22+).
2. **OpenCode CLI**: Phiên bản 1.14.0 trở lên.
   - Kiểm tra: `opencode --version`
   - Cài đặt OpenCode (nếu chưa có): `npm install -g opencode-ai` hoặc `bun add -g opencode-ai`
3. **Mạng Internet**: Cổng local `51121` không bị chiếm dụng (dùng cho trình duyệt OAuth callback).

---

## 🚀 2. Các bước Cài đặt Chi tiết (từ A-Z trên máy mới)

### Bước 1: Tạo thư mục Plugin cho OpenCode
Mở Terminal và chạy lệnh sau để tạo thư mục chứa plugin trong cấu hình OpenCode:

```bash
mkdir -p ~/.config/opencode/plugins/google-antigravity-auth
```

### Bước 2: Tải / Copy các tệp mã nguồn Plugin vào vị trí
Copy **6 tệp** sau vào thư mục `~/.config/opencode/plugins/google-antigravity-auth/`:

- `plugin.js`
- `oauth.js`
- `transport.js`
- `store.js`
- `package.json`
- `README.md`

*(Nếu cài đặt thủ công từ thư mục dự án, chạy lệnh:)*
```bash
cp plugin.js oauth.js transport.js store.js package.json README.md ~/.config/opencode/plugins/google-antigravity-auth/
```

### Bước 3: Cấu hình `~/.config/opencode/opencode.json`

Mở tệp cấu hình OpenCode tại `~/.config/opencode/opencode.json` (nếu chưa có thì tạo mới) và thêm plugin cùng danh sách provider/models như sau:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./plugins/google-antigravity-auth/plugin.js"
  ],
  "provider": {
    "google-antigravity": {
      "name": "Google Antigravity",
      "npm": "@ai-sdk/google",
      "models": {
        "gemini-3-flash": {
          "name": "Gemini 3 Flash (Antigravity)",
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
        "gemini-3.5-flash-low": {
          "name": "Gemini 3.5 Flash (Medium) (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "claude-opus-4-6-thinking": {
          "name": "Claude Opus 4.6 Thinking (Antigravity, experimental)",
          "limit": { "context": 200000, "output": 128000 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        },
        "claude-sonnet-4-6": {
          "name": "Claude Sonnet 4.6 (Antigravity, experimental)",
          "limit": { "context": 200000, "output": 64000 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
      }
    }
  }
}
```

---

## 🔑 3. Đăng nhập và Xác thực OAuth

Sau khi hoàn tất cấu hình:

1. Chạy lệnh đăng nhập trong Terminal:
   ```bash
   opencode auth login
   ```
2. Danh sách các Provider sẽ hiển thị. Chọn **`Google Antigravity (browser)`**.
3. Trình duyệt web sẽ tự động mở trang đăng nhập Google. Hãy đăng nhập tài khoản Google Antigravity của bạn và bấm **Cho phép (Allow)**.
4. Trình duyệt hiển thị thông báo thành công: *"Google Antigravity authentication completed. You can close this window."*
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
Trong giao diện TUI, chọn mô hình: `google-antigravity/gemini-3-flash` hoặc `google-antigravity/gemini-pro-agent`.

---

## ⚙️ 5. Biến Môi trường Tùy chỉnh (Tùy chọn)

- `OPENCODE_AGY_INJECT_SYSTEM=0`: Tắt tự động thêm System Prompt Antigravity mặc định.
- `PI_AI_ANTIGRAVITY_VERSION`: Ghi đè phiên bản User-Agent Antigravity (Mặc định: `1.21.9`).
- `OPENCODE_AGY_UA_MODE`: Chế độ User-Agent ngụy trang. Giá trị:
  - `sdk` (mặc định): `antigravity/<ver> <platform>/<arch>`
  - `cli`: `agy/<ver> <platform>/<arch>` (mặc định `1.1.5`)
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

---

## 🧪 7. Chạy Unit Tests (Dành cho Developer)

Nếu bạn muốn đóng góp hoặc phát triển thêm plugin:
```bash
node --test test/*.test.js
```
*(Bộ 20/20 unit tests phải pass. Cover: PKCE, OAuth URL, envelope wrapping, Claude tool sanitization, thinkingLevel mapping, SSE unwrap CRLF/LF, custom fetch v1internal rewrite, sidecar 0600).*

---

## 🏗️ 8. Kiến trúc Transport & Độ ổn định (Transport Internals)

Plugin không đơn thuần thay API key — nó **chặn toàn bộ tầng fetch** của `@ai-sdk/google` để ngụy trang request thành giao thức nguyên bản của Antigravity:

### Luồng xử lý Request
```
@ai-sdk/google  →  createAntigravityFetch (transport.js)
                   ├─ 1. resolveWireModelId(): alias `gemini-3.1-pro-high` → `gemini-pro-agent`
                   ├─ 2. postProcessGeminiBody(): sanitize tools (Claude), inject thoughtSignature (Gemini 3)
                   ├─ 3. sanitizeGenerationConfig(): xóa thinkingBudget, set thinkingLevel HIGH/LOW/MINIMAL
                   ├─ 4. injectAntigravitySystem(): chèn DeepMind System Instruction
                   ├─ 5. buildEnvelope(): wrap outer envelope {project, model, request, requestType, requestId}
                   ├─ 6. getAntigravityHeaders(): User-Agent + anthropic-beta (nếu Claude Thinking)
                   └─ 7. POST → /v1internal:streamGenerateContent?alt=sse
                                       ↓
                   unwrapSseResponseStream(): data: {"response": {...}} → data: {...}
```

### Endpoint Fallback Chain
Code thử lần lượt 3 endpoint Google (xử lý trường hợp sandbox bị nghẽn):
1. `https://daily-cloudcode-pa.sandbox.googleapis.com` (mặc định)
2. `https://autopush-cloudcode-pa.sandbox.googleapis.com`
3. `https://cloudcode-pa.googleapis.com` (production fallback)

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

## 📚 9. Danh mục 20 Mô hình (Full Model Catalog)

Plugin đăng ký 20 mô hình trong `ANTIGRAVITY_MODEL_CATALOG` (transport.js). Danh sách đầy đủ:

| # | Model ID (OpenCode) | Wire Model ID | Reasoning | Modalities |
|---|---|---|---|---|
| 1 | `gemini-3-flash` | `gemini-3-flash` | ✓ | text, image |
| 2 | `gemini-pro-agent` | `gemini-pro-agent` | ✓ | text, image |
| 3 | `gemini-3.1-pro-high` | `gemini-pro-agent` *(alias)* | ✓ | text, image |
| 4 | `gemini-3.1-pro-low` | `gemini-3.1-pro-low` | ✓ | text, image |
| 5 | `gemini-3.6-flash-high` | `gemini-3.6-flash-high` | ✓ | text, image |
| 6 | `gemini-3.6-flash-medium` | `gemini-3.6-flash-medium` | ✗ | text, image |
| 7 | `gemini-3.6-flash-low` | `gemini-3.6-flash-low` | ✗ | text, image |
| 8 | `gemini-3.5-flash-low` | `gemini-3.5-flash-low` | ✓ | text, image |
| 9 | `gemini-3.5-flash-extra-low` | `gemini-3.5-flash-extra-low` | ✓ | text, image |
| 10 | `gemini-3-flash-agent` | `gemini-3-flash-agent` | ✓ | text, image |
| 11 | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | ✗ | text |
| 12 | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | ✗ | text |
| 13 | `gemini-3.1-flash-image` | `gemini-3.1-flash-image` | ✗ | text |
| 14 | `gemini-2.5-pro` | `gemini-2.5-pro` | ✓ | text, image |
| 15 | `claude-opus-4-6-thinking` | `claude-opus-4-6-thinking` | ✓ | text, image |
| 16 | `claude-opus-4-5-thinking` | `claude-opus-4-5-thinking` | ✓ | text, image |
| 17 | `claude-sonnet-4-6` | `claude-sonnet-4-6` | ✓ | text, image |
| 18 | `claude-sonnet-4-5-thinking` | `claude-sonnet-4-5-thinking` | ✓ | text, image |
| 19 | `claude-sonnet-4-5` | `claude-sonnet-4-5` | ✗ | text, image |
| 20 | `gpt-oss-120b-medium` | `gpt-oss-120b-medium` | ✗ | text |

*Mô hình Claude/GPT-OSS là experimental — Google có thể thay đổi đường wire bất cứ lúc nào.*
