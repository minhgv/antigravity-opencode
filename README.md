# Google Antigravity Auth Plugin for OpenCode (v1.2.1)

Plugin tích hợp xác thực **Google Antigravity OAuth** và **Cloud Code Assist API** trực tiếp vào **OpenCode** (v1.14+).

Plugin cho phép sử dụng toàn bộ các mô hình **Gemini (Flash, Pro, Thinking)** cùng các dòng mô hình nâng cao (**Claude 4.5/4.6**, **GPT OSS**) thông qua tài khoản Google Antigravity mà **không cần API Key** và **không bị gãy Tool Calls** (do giữ nguyên native Gemini schema qua `@ai-sdk/google`).

---

## 🌟 Điểm nổi bật phiên bản v1.2.1

- ⚡ **Kiến trúc TypeScript Native Modular**: Mã nguồn được tổ chức module hóa chặt chẽ (`src/auth`, `src/models`, `src/transport`, `src/quota`, `src/image`, `src/utils`, `src/types`), biên dịch chuẩn ES Module.
- 🔄 **Hỗ trợ Dual Provider ID**: Hỗ trợ đồng thời 2 provider ID trong OpenCode:
  - `google-antigravity`: Provider chính thống (`Google Antigravity`).
  - `antigravity`: Alias ngắn gọn tiện lợi (`Antigravity (Native)`).
- 📊 **Kiểm tra Quota & Hạn mức Token Thời gian Thực (P1)**: Lệnh `quota.js` truy vấn trực tiếp Cloud Code Assist (`/v1internal:retrieveUserQuotaSummary`), hiển thị thanh tiến trình trực quan (% còn lại, thời gian reset) cho cả nhóm Gemini Models và Claude/GPT Models.
- 🎨 **Tích hợp Sinh ảnh Gemini (generate_image) (P2)**: Tích hợp tool và lệnh CLI sinh ảnh độ nét cao qua Gemini 3 Image models (`gemini-3-pro-image`, `gemini-3.1-flash-image`) với đầy đủ tỉ lệ khung hình (`16:9`, `1:1`, v.v.).
- 🔐 **Deterministic Project ID (`stableProjectId`) (P3)**: Tự động hash email của người dùng thành UUID v5 cố định theo tài khoản khi Google không trả về project riêng, đảm bảo tính cô lập và ổn định quota.
- 🚀 **Connection Pooling & TLS Prewarming**: Sử dụng connection pool giữ kết nối (keep-alive) thông qua `undici` Agent (8 connections) và prewarm TLS handshake ngầm tới endpoint Google, loại bỏ hoàn toàn độ trễ 150–300ms trong các tương tác tiếp theo.
- 🛠️ **Recursive JSON Schema Dereferencing**: Tự động giải quyết đệ quy các con trỏ `$ref`, `$defs`, `definitions` và chuẩn hóa schema về chuẩn OpenAPI, triệt tiêu hoàn toàn lỗi **HTTP 400 (INVALID_ARGUMENT)** khi OpenCode gửi các định nghĩa công cụ (tool definitions) phức tạp.
- 🧠 **Bảo tồn Gemini 3 Thought Signature**: Tự động inject và bảo tồn `thoughtSignature` (`skip_thought_signature_validator`) cho các mô hình thế hệ Gemini 3 khi thực hiện chuỗi multi-turn tool call.
- 🤖 **Mở rộng Model Catalog (31 Models)**: Sẵn sàng hỗ trợ đầy đủ Gemini 3.8 Flash, 3.7 Flash, 3.1 Pro Agent, 3.6 Flash, 3.5 Flash, cùng cầu nối tới Claude (Opus 4.6, Sonnet 4.6 Thinking) và GPT OSS 120b.
- 🧪 **100% Pass Unit Tests**: 43/43 unit tests kiểm thử tự động trên 8 test suites.

---

## 📁 Cấu trúc Thư mục

```
antigravity-opencode/
├── install.sh            # Cài đặt và build tự động (idempotent, cấu hình dual provider)
├── antigravity-auth/     # Mã nguồn plugin (TypeScript Native)
│   ├── src/
│   │   ├── auth/         # OAuth PKCE, credentials, store, deterministic project discovery
│   │   ├── models/       # Model catalog, thinking levels, model aliases
│   │   ├── transport/    # Custom fetch cho @ai-sdk/google, envelope wrapping, SSE stream unwrap
│   │   ├── quota/        # Tra cứu và định dạng quota / token pool thời gian thực
│   │   ├── image/        # Tạo ảnh qua Gemini Image models (16:9, 1:1, ...) & lưu file
│   │   ├── utils/        # Undici connection pool & prewarm, schema dereference, retry backoff, system prompt
│   │   ├── types/        # TypeScript type definitions
│   │   ├── bin/          # CLI scripts (quota.ts, image.ts)
│   │   ├── plugin.ts     # OpenCode plugin entry point (dual provider + generate_image tool)
│   │   └── index.ts      # Main barrel export
│   ├── plugin.js         # Entry point re-export dist/plugin.js (OpenCode runtime nạp file này)
│   ├── oauth.js          # Re-export dist/auth/index.js
│   ├── transport.js      # Re-export dist/transport, dist/models, dist/utils
│   ├── store.js          # Re-export dist/auth/store.js
│   ├── quota.js          # CLI kiểm tra Quota & Token Limits trực quan
│   ├── image.js          # CLI tạo ảnh độc lập với Gemini
│   ├── package.json      # Dependencies (undici) & scripts (build, quota, image, test)
│   ├── tsconfig.json     # Cấu hình TypeScript ESM (Node16)
│   └── test/             # Bộ 43 unit tests (Node.js test runner)
└── README.md             # Tài liệu này
```

---

## 📋 1. Yêu cầu Tiền đề (Prerequisites)

1. **Node.js**: Phiên bản 18+ (khuyên dùng Node 20 hoặc Node 22+).
2. **OpenCode CLI**: Phiên bản 1.14.0 trở lên.
   - Kiểm tra: `opencode --version`
   - Cài đặt OpenCode (nếu chưa có): `npm install -g opencode-ai` hoặc `bun add -g opencode-ai`
3. **Mạng Internet**: Cổng local `51121` không bị chiếm dụng (dùng cho OAuth redirect callback).

---

## 🚀 2. Cài đặt

### Cách A: Cài đặt tự động (Khuyên dùng — Idempotent, CLI/Agent an toàn)

Chỉ cần chạy một lệnh duy nhất. Script tự động build TypeScript, sao chép files mã nguồn + thư mục `dist/` + `node_modules/`, và tự động merge cấu hình vào `opencode.json` mà không làm mất các cấu hình sẵn có của bạn:

```bash
bash install.sh
```

Hoặc thực thi từ thư mục bất kỳ:

```bash
bash /path/to/antigravity-opencode/install.sh
```

**Tùy chọn:**
```bash
OPENCODE_AGY_SKIP_CONFIG=1 bash install.sh   # Chỉ build & copy files, không đụng tới file opencode.json
```

---

### Cách B: Cài đặt thủ công (Manual)

Nếu bạn muốn tự tay kiểm soát các bước cài đặt:

**Bước 1: Biên dịch TypeScript & cài đặt dependencies**
```bash
cd antigravity-auth
npm install
npm run build
```

**Bước 2: Tạo thư mục plugin trong OpenCode**
```bash
mkdir -p ~/.config/opencode/plugins/antigravity-auth
```

**Bước 3: Sao chép files thực thi và build artifacts**
```bash
# Từ thư mục antigravity-auth/
cp plugin.js oauth.js transport.js store.js quota.js image.js package.json ~/.config/opencode/plugins/antigravity-auth/
cp -R dist node_modules ~/.config/opencode/plugins/antigravity-auth/
chmod +x ~/.config/opencode/plugins/antigravity-auth/quota.js ~/.config/opencode/plugins/antigravity-auth/image.js
```

**Bước 4: Cấu hình `~/.config/opencode/opencode.json`**

Thêm plugin và khai báo providers (bạn có thể đăng ký `google-antigravity`, `antigravity`, hoặc cả hai):

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
    },
    "antigravity": {
      "name": "Antigravity (Native)",
      "npm": "@ai-sdk/google",
      "models": {
        "gemini-3.7-flash-high": {
          "name": "Gemini 3.7 Flash (High) (Antigravity)",
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
        "gemini-3-flash": {
          "name": "Gemini 3 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "reasoning": true,
          "tool_call": true,
          "modalities": { "input": ["text", "image"], "output": ["text"] }
        }
      }
    }
  }
}
```

> **Ghi chú:** Script `install.sh` tự động cấu hình cả 2 provider `google-antigravity` và `antigravity` với đầy đủ 20 model Gemini sẵn sàng sử dụng.

---

## 🔑 3. Đăng nhập và Xác thực OAuth

Sau khi cài đặt:

1. Chạy lệnh đăng nhập trong Terminal:
   ```bash
   opencode auth login
   ```
2. Danh sách các Provider sẽ hiển thị. Chọn một trong hai tùy chọn Antigravity:
   - **`Google Antigravity (browser)`** (ứng với provider `google-antigravity`)
   - **`Google Antigravity (alias)`** (ứng với provider `antigravity`)
3. Trình duyệt web sẽ tự động mở trang đăng nhập Google. Hãy đăng nhập tài khoản Google Antigravity của bạn và bấm **Cho phép (Allow)**.
4. Trình duyệt hiển thị thông báo thành công: *"Google Antigravity authentication completed. You can close this window and return to OpenCode."*
5. Quay lại Terminal, OpenCode xác nhận đã lưu thông tin xác thực vào `~/.local/share/opencode/auth.json`, đồng thời plugin tự động lưu metadata vào `~/.config/opencode/google-antigravity-meta.json` (chế độ bảo mật `0600`).

---

## 🧪 4. Kiểm tra & Sử dụng

### 4.1. Kiểm tra Quota & Hạn mức Token Thời gian Thực (Mới 🌟)

Bạn có thể tra cứu ngay lập tức số lượng quota còn lại của tài khoản Google Antigravity (gồm 2 nhóm dùng chung: **Gemini Models** và **Claude/GPT Models**):

```bash
# Chạy từ thư mục cài đặt plugin
node ~/.config/opencode/plugins/antigravity-auth/quota.js

# Hoặc xem chi tiết từng mô hình cụ thể trong quota pool
node ~/.config/opencode/plugins/antigravity-auth/quota.js --models
```

**Mẫu kết quả trực quan:**
```
================================================================
📊 Google Antigravity Quota Status (Project: rising-fact-p41fc)
Endpoint: https://cloudcode-pa.googleapis.com
================================================================

🔹 Gemini Models
   (Models within this group: Gemini Flash, Gemini Pro)
   [###################-] Weekly Limit Remaining     : 97.1% còn lại (Reset: 5d 22h)
   [#################---] Five Hour Limit Remaining  : 87.4% còn lại (Reset: 4h 11m)

🔹 Claude and GPT models
   (Models within this group: Claude Opus, Claude Sonnet, GPT-OSS)
   [####################] Weekly Limit Remaining     :  100% còn lại (Reset: 6d 23h)
   [####################] Five Hour Limit Remaining  :  100% còn lại (Reset: 5h 0m)
================================================================
```

---

### 4.2. Sinh ảnh bằng Gemini Image Models (Mới 🌟)

Plugin tích hợp sẵn tool `generate_image` cho Agent OpenCode và cung cấp lệnh CLI để tạo ảnh độc lập:

**Cách 1: Yêu cầu trực tiếp Agent OpenCode trong phiên làm việc**
> *"Vẽ cho tôi một bức ảnh phong cảnh cyberpunk Hà Nội tỉ lệ 16:9"*  
Agent sẽ tự động gọi tool `generate_image` và lưu ảnh vào thư mục `.opencode/generated-images/`.

**Cách 2: Chạy trực tiếp từ dòng lệnh (CLI)**
```bash
# Tạo ảnh với tỉ lệ 16:9
node ~/.config/opencode/plugins/antigravity-auth/image.js --prompt "A futuristic floating city in the clouds" --ratio 16:9 --out ./city.png

# Xem danh sách tùy chọn
node ~/.config/opencode/plugins/antigravity-auth/image.js --help
```

---

### 4.3. Kiểm tra danh sách mô hình đã nạp:
```bash
# Kiểm tra theo provider chính
opencode models google-antigravity

# Hoặc kiểm tra theo alias ngắn
opencode models antigravity
```

### 4.4. Chạy OpenCode với mô hình Antigravity:
```bash
opencode
```
Trong giao diện TUI của OpenCode, bạn có thể chọn bất kỳ mô hình nào đã cấu hình, ví dụ:
- `google-antigravity/gemini-3.8-flash-high` (Thế hệ mới nhất)
- `google-antigravity/gemini-3.7-flash-high`
- `google-antigravity/gemini-pro-agent` (Dành cho tác vụ code phức tạp)
- Hoặc dùng alias ngắn gọn:
  - `antigravity/gemini-3.7-flash-high`
  - `antigravity/gemini-pro-agent`
  - `antigravity/gemini-3-flash`

---

## ⚙️ 5. Biến Môi trường Tùy chỉnh (Environment Variables)

Bạn có thể tùy chỉnh hành vi của plugin thông qua các biến môi trường sau:

| Biến môi trường | Mặc định | Ý nghĩa & Tùy chọn |
|---|---|---|
| `OPENCODE_AGY_UA_MODE` | `cli` | Chế độ User-Agent gửi tới Google API:<br>• `cli` (khuyên dùng): `antigravity/cli/<ver>` — **bắt buộc để backend cấp các model mới nhất như Gemini 3.7/3.8**<br>• `sdk`: `antigravity/<ver>`<br>• `desktop`: `Antigravity/<ver>` |
| `PI_AI_ANTIGRAVITY_VERSION` | `1.1.13` (cli) | Ghi đè chuỗi phiên bản trong User-Agent |
| `ANTIGRAVITY_PROJECT_ID` | *(auto)* | Ghi đè Project ID chỉ định thay vì dùng tự động phát hiện |
| `OPENCODE_AGY_NO_KEEPALIVE` | `0` | Đặt `=1` để tắt Connection Pool (Undici Agent) và fallback về fetch chuẩn |
| `OPENCODE_AGY_NO_PREWARM` | `0` | Đặt `=1` để tắt tính năng tiền kết nối (TLS handshake prewarm) trong background |
| `OPENCODE_AGY_HTTP2` | `0` | Đặt `=1` để bật hỗ trợ giao thức HTTP/2 trên Undici Connection Pool |
| `OPENCODE_AGY_INJECT_SYSTEM` | `1` | Đặt `=0` để tắt chèn DeepMind Antigravity System Instruction mặc định |
| `OPENCODE_AGY_DEBUG` | `0` | Đặt `=1` để ghi chi tiết request/response envelope khi gặp lỗi ra `/tmp/agy-debug-*.json` (tự lọc bỏ token nhạy cảm) |

---

## 🔒 6. Lưu ý Bảo mật & Khắc phục Lỗi

1. **Phân quyền Tệp Sidecar (`0600`)**: Plugin lưu `projectId` và `email` vào `~/.config/opencode/google-antigravity-meta.json` với phân quyền `0600` (chỉ user sở hữu tiến trình mới có quyền đọc/ghi).
2. **Deterministic Project ID (`stableProjectId`)**: Khi Google không trả về `cloudaicompanionProject`, plugin áp dụng thuật toán `stableProjectId(email)` sinh ra một UUID v5 định danh duy nhất theo tài khoản email của bạn. Điều này đảm bảo tính ổn định và tách biệt quota giữa các tài khoản khác nhau trên cùng máy.
3. **Single-flight Token Refresh**: Khi nhiều tool call hoặc streaming request chạy song song cùng phát hiện token hết hạn, chỉ có **1 request refresh duy nhất** được gửi tới Google token endpoint (`refreshInFlight`). Tất cả các luồng khác chờ kết quả chung, triệt tiêu nguy cơ race condition hay bị Google rate-limit token refresh.
4. **Xử lý Đệ quy Tool Schemas ($defs / $ref)**: Khi các công cụ OpenCode trả về schema phức tạp chứa con trỏ JSON Schema (`$defs`, `$ref`, `definitions`), hàm `dereferenceSchema()` sẽ đệ quy làm phẳng và `sanitizeForOpenApi()` loại bỏ meta-keywords, ngăn ngừa triệt để lỗi HTTP 400 từ Google API.
5. **⚠️ Gemini 3.7 Flash — `thinkingLevel: MINIMAL` không được hỗ trợ**:
   - Backend Antigravity từ chối mức `MINIMAL` cho Gemini 3.7+ và trả về HTTP 400.
   - **Plugin tự động xử lý**: Hàm `sanitizeGenerationConfig()` tự động floor mức `MINIMAL` thành `LOW` cho tất cả các model `gemini-3.7+` qua helper `isMinimalThinkingSupported()`. Các mức `LOW`, `MEDIUM`, `HIGH` đều hoạt động ổn định.
6. **Xử lý Quota `Resource has been exhausted`**: Khi chạy Gemini 3.7 liên tục với chuỗi tool call dày đặc, bạn có thể gặp rate limit từ Google Cloud Code Assist. Plugin tích hợp sẵn cơ chế Exponential Backoff với `Retry-After` header và phân tích payload lỗi để tự động retry khi gặp HTTP 429/5xx.

---

## 🧪 7. Chạy Unit Tests

Plugin đi kèm bộ kiểm thử toàn diện **43/43 tests pass 100% trên 8 test suites**, sử dụng trực tiếp Node.js Test Runner:

```bash
cd antigravity-auth
npm test
```

**Kết quả kiểm thử:**
- **P1: Quota & Usage formatting** (3 tests): Định dạng thanh tiến trình % quota, delta thời gian reset, báo cáo quota hoàn chỉnh.
- **P2: Image Generation module** (4 tests): Kiểm tra tính hợp lệ của model sinh ảnh, tỉ lệ khung hình (16:9, 1:1...), chống directory traversal path escape, dựng outer envelope với `imageConfig`.
- **P3: Deterministic ProjectId** (2 tests): Kiểm tra tính nhất quán của `stableProjectId` từ email và biến môi trường `ANTIGRAVITY_PROJECT_ID`.
- **Plugin Tool Registration** (1 test): Đăng ký thành công tool `generate_image` trên cả provider chính và alias.
- **oauth helpers** (3 tests): Tạo PKCE verifier/challenge, URL auth với đầy đủ scopes, buffer thời gian hết hạn token.
- **transport** (23 tests): Trích xuất Model ID từ URL, nhận diện URL Generative Language, wrap envelope Antigravity, Claude tool adapter & schema sanitization, Gemini 3 `thoughtSignature` sentinel, chuẩn hóa tool ID, thinking level mapping & 3.7+ MINIMAL floor, incremental SSE unwrap (hỗ trợ cả CRLF và multi-event chunk), rewrite v1internal, xử lý HTTP 401 tự động refresh, hủy stream an toàn.
- **store sidecar** (1 test): Đọc/ghi `projectId` bảo mật với phân quyền hệ thống.
- **native architecture improvements** (6 tests): Xử lý prefix dual provider (`google-antigravity/` & `antigravity/`), giải quyết đệ quy `$defs/$ref` trong schemas, fallback root schema về object, tiền kết nối TLS prewarming, và khởi tạo AuthHooks cho cả 2 providers.

---

## 🏗️ 8. Kiến trúc Transport & Độ ổn định (Transport Internals)

Plugin chặn và tái cấu trúc toàn bộ tầng fetch của `@ai-sdk/google`, chuyển hóa request thành định dạng đặc tả của Antigravity:

### Luồng xử lý Request (Native Pipeline)

```
@ai-sdk/google  →  createAntigravityFetch (src/transport/fetch.ts)
                   │
                   ├─ 1. resolveWireModelId(): Chuẩn hóa alias model (vd: gemini-3.1-pro-high → gemini-pro-agent)
                   ├─ 2. adaptToolsForModel(): Đệ quy giải quyết $defs/$ref, sanitize OpenAPI schema
                   ├─ 3. postProcessContents(): Chèn Gemini 3 thoughtSignature, chuẩn hóa Tool Call IDs
                   ├─ 4. sanitizeGenerationConfig(): Chuyển thinkingBudget → thinkingLevel (HIGH/MEDIUM/LOW), floor 3.7+ MINIMAL→LOW
                   ├─ 5. injectAntigravitySystem(): Chèn DeepMind System Instruction vào đầu request
                   ├─ 6. buildEnvelope(): Đóng gói Outer Envelope { project, model, request, requestType: "agent", userAgent: "antigravity", requestId }
                   ├─ 7. getAntigravityHeaders(): Bổ sung User-Agent CLI, client metadata, anthropic-beta header (cho Claude)
                   ├─ 8. antigravityFetch(): Gửi request qua Undici keep-alive pool (hỗ trợ TLS prewarming)
                   │     POST → /v1internal:streamGenerateContent?alt=sse
                   │
                   └─ 9. unwrapSseResponseStream(): Giải nén luồng SSE data: {"response": {...}} → data: {...}
```

### Chuỗi Fallback Endpoints

Plugin tự động điều hướng request qua 3 endpoint của Google Cloud Code Assist theo thứ tự ưu tiên:
1. `https://daily-cloudcode-pa.sandbox.googleapis.com` (Thử trước tiên)
2. `https://autopush-cloudcode-pa.sandbox.googleapis.com` (Fallback thứ hai)
3. `https://cloudcode-pa.googleapis.com` (Production — Fallback cuối cùng)

### Ngụy trang 5 Vectơ Nhận diện Client

1. **User-Agent & Client-Metadata**: Mô phỏng định dạng CLI chính thức của Antigravity kèm hệ điều hành và kiến trúc chip (`darwin/arm64`, `linux/amd64`, `windows/amd64`).
2. **Outer Envelope**: Đúng schema của Antigravity Agent (`requestType: "agent"`, `userAgent: "antigravity"`).
3. **DeepMind System Prompt**: Tự động ghép vào `systemInstruction.parts[0]`.
4. **Thinking Configuration Enum**: Luôn chuẩn hóa thành `thinkingLevel` thay vì `thinkingBudget`.
5. **SSE Stream Parsing Chuẩn**: Hỗ trợ xử lý incremental cả `\r\n` (CRLF) và `\n` (LF) mà không cần buffer toàn bộ stream.

---

## 📚 9. Danh mục Mô hình Toàn diện (Full Model Catalog)

Plugin hỗ trợ danh mục mô hình chuẩn được định nghĩa trong `src/models/catalog.ts` kèm cơ chế tự động alias (`resolveWireModelId`) để tránh lỗi 404 cho các mã model không có hậu tố thinking:

### 🚀 Dòng Gemini 3.8 Flash (Thế hệ mới nhất)
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 1 | `gemini-3.8-flash-high` | `gemini-3.8-flash-high` | `HIGH` | 1M / 64k | text, image |
| 2 | `gemini-3.8-flash-medium` | `gemini-3.8-flash-medium` | `MEDIUM` | 1M / 64k | text, image |
| 3 | `gemini-3.8-flash-low` | `gemini-3.8-flash-low` | `LOW` | 1M / 64k | text, image |
*(Lưu ý: Nếu gọi mã `gemini-3.8-flash` trần, plugin sẽ tự động route an toàn sang `gemini-3.8-flash-high` để tránh lỗi HTTP 404 từ backend Google).*

### 🌟 Dòng Gemini 3.7 Flash (Thinking mặc định)
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 4 | `gemini-3.7-flash-high` | `gemini-3.7-flash-high` | `HIGH` | 1M / 64k | text, image |
| 5 | `gemini-3.7-flash-medium` | `gemini-3.7-flash-medium` | `MEDIUM` | 1M / 64k | text, image |
| 6 | `gemini-3.7-flash-low` | `gemini-3.7-flash-low` | `LOW` | 1M / 64k | text, image |

### 🧠 Dòng Gemini 3.1 Pro (Chuyên sâu Coding & Agentic)
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 7 | `gemini-pro-agent` | `gemini-pro-agent` | `HIGH` | 1M / 64k | text, image |
| 8 | `gemini-3.1-pro-high` | `gemini-pro-agent` *(alias)* | `HIGH` | 1M / 64k | text, image |
| 9 | `gemini-3.1-pro-low` | `gemini-3.1-pro-low` | `LOW` | 1M / 64k | text, image |

### ⚡ Dòng Gemini 3.6 Flash
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 10 | `gemini-3.6-flash-high` | `gemini-3.6-flash-high` | `HIGH` | 1M / 64k | text, image |
| 11 | `gemini-3.6-flash-medium` | `gemini-3.6-flash-medium` | *Tắt (false)* | 1M / 64k | text, image |
| 12 | `gemini-3.6-flash-low` | `gemini-3.6-flash-low` | `LOW` | 1M / 64k | text, image |

### 🚀 Dòng Gemini 3.5 Flash
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 13 | `gemini-3-flash-agent` | `gemini-3-flash-agent` | `HIGH` | 1M / 64k | text, image |
| 14 | `gemini-3.5-flash-low` | `gemini-3.5-flash-low` | `MEDIUM` | 1M / 64k | text, image |
| 15 | `gemini-3.5-flash-extra-low` | `gemini-3.5-flash-extra-low` | `LOW` | 1M / 64k | text, image |
| 16 | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | *Tắt (false)* | 1M / 64k | text |

### 🎯 Dòng Gemini 3 Flash & Phụ trợ
| # | Model ID (OpenCode) | Wire Model ID | Thinking Level | Context / Output | Modalities |
|---|---|---|---|---|---|
| 17 | `gemini-3-flash` | `gemini-3-flash` | `MINIMAL` | 1M / 64k | text, image |
| 18 | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` | *Tắt (false)* | 1M / 64k | text |
| 19 | `gemini-3.1-flash-image` | `gemini-3.1-flash-image` | *Tắt (false)* | 1M / 64k | text |

### 🎭 Claude Models (Qua Antigravity Bridge)
*Được hỗ trợ đầy đủ qua cơ chế bridge chuyển tiếp của Antigravity với header `anthropic-beta: interleaved-thinking-2025-05-14` và chuẩn hóa tool call ID:*
| # | Model ID (OpenCode) | Wire Model ID | Reasoning | Context / Output | Modalities |
|---|---|---|---|---|---|
| 20 | `claude-opus-4-6` | `claude-opus-4-6` | Có | 250k / 64k | text, image |
| 21 | `claude-opus-4-6-thinking` | `claude-opus-4-6-thinking` | Có | 250k / 64k | text, image |
| 22 | `claude-sonnet-4-6` | `claude-sonnet-4-6` | Có | 200k / 64k | text, image |
| 23 | `claude-sonnet-4-6-thinking` | `claude-sonnet-4-6-thinking` | Có | 200k / 64k | text, image |
| 24 | `claude-sonnet-4-5` | `claude-sonnet-4-5` | Không | 200k / 64k | text, image |
| 25 | `claude-sonnet-4-5-thinking` | `claude-sonnet-4-5-thinking` | Có | 200k / 64k | text, image |

### 🌐 GPT OSS Models
| # | Model ID (OpenCode) | Wire Model ID | Reasoning | Context / Output | Modalities |
|---|---|---|---|---|---|
| 26 | `gpt-oss-120b` | `gpt-oss-120b` | Có | 131k / 32k | text |

---

## 💡 Mẹo cấu hình mô hình bổ sung

Nếu bạn muốn sử dụng các model nâng cao như Claude hoặc GPT OSS, chỉ cần thêm cấu hình tương ứng vào khối `provider.google-antigravity.models` hoặc `provider.antigravity.models` trong file `opencode.json`:

```json
"claude-sonnet-4-6-thinking": {
  "name": "Claude Sonnet 4.6 Thinking (Antigravity)",
  "limit": { "context": 200000, "output": 65536 },
  "reasoning": true,
  "tool_call": true,
  "modalities": { "input": ["text", "image"], "output": ["text"] }
}
```
Sau đó khởi động lại OpenCode và chọn model để sử dụng!
