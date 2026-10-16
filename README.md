# Google Antigravity Auth Plugin for OpenCode (v1.4.0)

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![OpenCode](https://img.shields.io/badge/OpenCode-v2.x%20%7C%20v1.14%2B-blue.svg)](https://opencode.ai)
[![Tests](https://img.shields.io/badge/Tests-55%2F55%20pass-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM-blue.svg)](https://www.typescriptlang.org/)

Plugin tích hợp xác thực **Google Antigravity OAuth** và **Cloud Code Assist API** trực tiếp vào **OpenCode** — hỗ trợ **v2.x** (quyền chính, qua `plugins` dir API `{id, setup}`) và **v1.14+** (legacy `plugin` file entry).

Cung cấp toàn quyền truy cập hệ sinh thái **Gemini (Flash, Pro, Thinking)**, **Claude 5.5** và **GPT OSS** qua tài khoản Google Antigravity: **không cần API Key**, **giữ nguyên native tool calls** (`@ai-sdk/google`), và đạt **wire-format parity 1:1** với client Antigravity chính thức.

---

## 🌟 Điểm nổi bật phiên bản v1.4.0

- 🚀 **Gemini 4 Argon & Upstream Catalog Sync**:
  - Hỗ trợ đầy đủ các tier `gemini-4-argon-{high,medium,low}` (1M context / 64k output, thinking reasoning đầy đủ).
  - Bổ sung `gemini-3.5-flash-lite` và `gemini-3-flash` (non-thinking).
  - Đăng ký nhóm `gemini-argon` family chuẩn hóa cho OpenCode v2 provider selection.
- 🔄 **Auto Fallback cho Argon (`OPENCODE_AGY_AUTO_FALLBACK=1`)**:
  - Tự động bắt lỗi terminal `429 RESOURCE_EXHAUSTED` hoặc `404` của Gemini 4 Argon và retry chuyển sang `gemini-3.8-flash` cùng tier (`high` $\rightarrow$ `high`, `medium` $\rightarrow$ `medium`, `low` $\rightarrow$ `low`), đảm bảo luồng làm việc không bị gián đoạn.
- 🧹 **Dọn dẹp Model cũ & Hint 404 Thông minh**:
  - Loại bỏ các model đã bị Google gỡ khỏi backend (Gemini 3.7/3.6/3.5-flash tiers, Gemini 3.1 Pro, `gemini-pro-agent`, Claude 4.x).
  - Request tới các model đã gỡ không còn bị redirect ngầm mà sẽ báo lỗi 404 kèm hướng dẫn trực tiếp các model thay thế khả dụng.
- 🔁 **Kế thừa đầy đủ OpenCode 2.x Native Plugin API & v1.14+ (từ v1.3.0)**:
  - Tự động đăng ký kép provider `google-antigravity` và `antigravity`, hook qua `@ai-sdk/google`.

### Từ v1.3.0

- 🆕 **OpenCode 2.x Native Plugin API**:
  - Entry `index.js` default-export `{id, setup}`; tự đăng ký 2 providers + model catalog, OAuth methods, AI SDK transport hook — không cần block `provider` trong `opencode.json`.
  - Credentials dùng `credential` store của v2 (`opencode.db`), fallback đọc `auth.json`/sidecar v1 để tool & CLI vẫn chạy.
  - Vendored `@ai-sdk/google` (`dist/vendor/google-ai-sdk.js`) vì plugin host v2 không resolve nested bare imports.
  - Tương thích ngược v1.14+ qua `server` export (`plugin: [...]` entry).

- 🎯 **Wire-Format Parity & Anti-Fingerprinting**:
  - Tự động tạo trajectory per-session identity (`requestId: agent/<agentId>/<ts>/<trajectoryId>/<step>`, signed int63 `sessionId`, telemetry labels).
  - Loại bỏ `requestType: "agent"` khỏi request envelope (tránh bare-429 `RESOURCE_EXHAUSTED` từ bucket hạn chế của Google).
  - Tự động theo dõi phiên bản Antigravity mới nhất qua electron-builder update manifest cho User-Agent.
  - Xóa bỏ branding OpenCode/Claude-SDK và obfuscate cụm từ nhạy cảm trong `systemInstruction` bằng zero-width space (`U+200B`).
  - Tùy chọn ẩn danh công cụ (`OPENCODE_AGY_CLOAK_TOOLS=1` chèn hậu tố `_ide` và decoy tools).
- 🔄 **Dual Provider & Multi-Account Failover**:
  - Hỗ trợ đồng thời 2 provider ID: `google-antigravity` (chính) và `antigravity` (alias ngắn).
  - Tự động luân chuyển tài khoản (account rotation) sang tài khoản phụ khi tài khoản chính cạn quota (HTTP 429).
- 📊 **Kiểm tra Quota & Token Limits Thời gian Thực**:
  - Tích hợp công cụ `check_quota` trực tiếp trong OpenCode session và CLI `quota.js`.
  - Hiển thị thanh tiến trình trực quan (% còn lại, thời gian reset) cho 2 nhóm dùng chung: **Gemini Models** và **Claude/GPT Models**.
- 🎨 **Tạo ảnh Gemini Image Models (`generate_image`)**:
  - Tích hợp tool `generate_image` trong OpenCode và CLI độc lập `image.js`.
  - Hỗ trợ `gemini-3-pro-image`, `gemini-3.1-flash-image` với đầy đủ tỉ lệ (`16:9`, `1:1`, `9:16`, `4:3`...).
- 🔐 **Deterministic Project ID (`stableProjectId`)**:
  - Tự động tạo UUID v5 từ email khi Google không trả về project riêng, đảm bảo quota độc lập và nhất quán.
- 🚀 **Hiệu năng & Độ tin cậy**:
  - Connection pooling (Undici keep-alive 8 kết nối) kết hợp TLS prewarming ngầm, triệt tiêu 150–300ms trễ handshake.
  - Bộ giải quyết đệ quy `$defs/$ref` và chuẩn hóa schema về OpenAPI, loại bỏ triệt để lỗi HTTP 400 (`INVALID_ARGUMENT`).
  - Giữ lại `thoughtSignature` cho Gemini 3 trong các chuỗi tool call lặp vòng.
  - Cơ chế 60s first-event watchdog failover và ghi nhớ endpoint thành công gần nhất (`lastGoodEndpoint`).
- 🧪 **51/51 Unit Tests pass 100%** trên 8 test suites (Node.js Test Runner).

---

## ⚡ Cài đặt Nhanh (1 bước)

Yêu cầu: **Node.js 18+**, **OpenCode v2.x** (khuyên dùng) hoặc **v1.14.0+**.

Chạy lệnh cài đặt tự động (idempotent, an toàn re-run, tự merge cấu hình mà không ghi đè key khác):

```bash
bash install.sh
```

Installer **tự detect mọi layout** và cấu hình một lần cho đủ — không cần sửa tay:

| Layout | Hành vi |
|---|---|
| Chỉ v1 | `~/.config/opencode/opencode.json` ← `plugin` + `provider.<id>.models` |
| Chỉ v2 | `~/.config/opencode/opencode.json` ← `plugins` (không `provider`) |
| **v1 + v2** | `~/.config/opencode` (v1 format) + `~/.config/opencode2` (v2 format), wrapper `opencode`/`opencode2`, symlink share `plugins`/`skills`/`agents`/`commands`/`context-mode`/`AGENTS.md`, hardlink `auth.json` |

Kèm theo: wrapper `~/.local/bin/opencode` (v1, data dir riêng `~/.local/share/opencode-v1` tránh đụng schema `opencode.db`), wrapper `~/.opencode/bin/opencode2` (v2, `XDG_CONFIG_HOME=~/.config/opencode2`), adhoc re-sign binary macOS, đảm bảo entry `google-antigravity` trong `auth.json`, và **tự restart `opencode serve`** để plugin mới có hiệu lực (fix lỗi `API key not valid`).

Trên **v2**, plugin đăng ký providers + model catalog qua `provider.transform` (`plugins: ["./plugins/antigravity-auth"]`); SDK `@ai-sdk/google` được vendor thành `dist/vendor/google-ai-sdk.js` vì plugin host v2 không resolve nested bare imports. Trên **v1**, tools (`check_quota`, `generate_image`) dùng `tool()` helper từ `@opencode-ai/plugin` với zod `args`.

*(Tùy chọn: `OPENCODE_AGY_SKIP_CONFIG=1` chỉ copy file không sửa config; `OPENCODE_AGY_NO_RESTART=1` không kill daemon; `OPENCODE_AGY_TARGET=v1|v2` ép target.)*

---

## 🔑 Đăng nhập OAuth

1. Chạy lệnh đăng nhập trong Terminal:
   ```bash
   opencode auth login
   ```
2. Chọn một trong hai provider:
   - **`Google Antigravity (browser)`** (provider: `google-antigravity`)
   - **`Google Antigravity (alias)`** (provider: `antigravity`)
3. Trình duyệt tự động mở để xác thực Google. Chọn tài khoản và nhấn **Allow**.
4. Hoàn tất! Thông tin xác thực được lưu trong `credential` store của OpenCode v2 (`~/.local/share/opencode/opencode.db`); plugin cũng đọc fallback `~/.local/share/opencode/auth.json` + sidecar `~/.config/opencode/google-antigravity-meta.json` (phân quyền `0600`) cho các bản migrate từ v1.

> 💡 **Mẹo Multi-Account:** Đăng nhập một tài khoản vào `google-antigravity` và một tài khoản khác vào `antigravity`. Plugin sẽ tự động chuyển đổi giữa 2 tài khoản khi một bên chạm giới hạn quota.

---

## 🛠️ Hướng dẫn Sử dụng & Công cụ

### 1. Kiểm tra Quota Hạn mức (`check_quota`)

- **Trong OpenCode:** Yêu cầu trực tiếp trong chat:
  > *"Kiểm tra quota Antigravity còn lại bao nhiêu"*  
  Agent sẽ tự động gọi tool `check_quota`.
- **Qua dòng lệnh (CLI):**
  ```bash
  # Xem báo cáo quota tổng quan
  node ~/.config/opencode/plugins/antigravity-auth/quota.js

  # Xem chi tiết từng model trong quota pool
  node ~/.config/opencode/plugins/antigravity-auth/quota.js --models
  ```

### 2. Tạo ảnh Gemini (`generate_image`)

- **Trong OpenCode:** Yêu cầu Agent sinh ảnh:
  > *"Vẽ một bức ảnh phong cảnh cyberpunk Hà Nội tỉ lệ 16:9"*  
  Ảnh sẽ được tự động lưu vào workspace (`.opencode/generated-images/`).
- **Qua dòng lệnh (CLI):**
  ```bash
  node ~/.config/opencode/plugins/antigravity-auth/image.js --prompt "Cyberpunk city in clouds" --ratio 16:9 --out ./city.png
  ```

### 3. Sử dụng mô hình trong OpenCode

Khởi chạy OpenCode:
```bash
opencode
```
Chọn mô hình mong muốn trong giao diện TUI, ví dụ:
- `google-antigravity/gemini-4-argon-high` (suy luận chuyên sâu)
- `google-antigravity/gemini-3.8-flash-high`
- `google-antigravity/gemini-3.5-flash-lite` (nhẹ, không thinking)
- `google-antigravity/gemini-3-flash` (không thinking)
- Hoặc dùng tiền tố ngắn: `antigravity/gemini-4-argon`, `antigravity/gemini-3.8-flash`...

---

## 🤖 Danh mục Mô hình (Model Catalog)
| Dòng mô hình | Model ID trong OpenCode | Wire Model ID | Thinking / Reasoning | Context / Output | Modalities |
|---|---|---|:---:|:---:|:---:|
| **Gemini 3.8 Flash** | `gemini-3.8-flash-high`<br>`gemini-3.8-flash-medium`<br>`gemini-3.8-flash-low` | `gemini-3.8-flash-high`<br>`gemini-3.8-flash-medium`<br>`gemini-3.8-flash-low` | `HIGH`<br>`MEDIUM`<br>`LOW` | 1M / 64k | text, image |
| **Gemini 4 Argon** | `gemini-4-argon-high`<br>`gemini-4-argon-medium`<br>`gemini-4-argon-low` | `gemini-4-argon-high`<br>`gemini-4-argon-medium`<br>`gemini-4-argon-low` | `HIGH`<br>`MEDIUM`<br>`LOW` | 1M / 64k | text, image |
| **Gemini 3.5 Flash Lite** | `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | Tắt | 1M / 64k | text, image |
| **Gemini 3 Flash** | `gemini-3-flash` | `gemini-3-flash` | Tắt | 1M / 64k | text, image |
| **Claude Opus 5.5** | `claude-opus-5-5-high`<br>`claude-opus-5-5-medium`<br>`claude-opus-5-5-low` | `claude-opus-5-5-high`<br>`claude-opus-5-5-medium`<br>`claude-opus-5-5-low` | Bật | 1M / 64k | text, image |
| **Claude Sonnet 5.5** | `claude-sonnet-5-5-high`<br>`claude-sonnet-5-5-medium`<br>`claude-sonnet-5-5-low` | `claude-sonnet-5-5-high`<br>`claude-sonnet-5-5-medium`<br>`claude-sonnet-5-5-low` | Bật | 1M / 64k | text, image |
| **GPT OSS** | `gpt-oss-120b-medium` | `gpt-oss-120b-medium` | Bật | 131k / 32k | text |
| **Gemini Image** *(tool `generate_image`)* | `gemini-3-pro-image`<br>`gemini-3.1-flash-image` | `gemini-3-pro-image`<br>`gemini-3.1-flash-image` | Tắt | 1M / 64k | image out |

> 📌 **Lưu ý:** Danh sách trên khớp với model picker Antigravity ngày 14/10/2026. Bare `gemini-4-argon` và `gemini-3.8-flash` route về tier `MEDIUM`; bare `claude-*-5-5` về medium, `-thinking` về high; bare `gpt-oss-120b` về medium. Model cũ đã bị upstream gỡ (Gemini 3.7/3.6/3.5-flash tiers, Gemini 3.1 Pro, `gemini-pro-agent`, Claude 4.x) **không còn redirect** — request sẽ báo lỗi 404, hãy chuyển sang id mới. GPT-OSS sẽ bị gỡ khỏi Antigravity vào 02/11/2026.

---

## ⚙️ Biến Môi trường Tùy chỉnh (Environment Variables)

| Biến môi trường | Mặc định | Chức năng & Mô tả |
|---|---|---|
| `OPENCODE_AGY_UA_MODE` | `hub` | Định dạng User-Agent gửi tới Google API: `hub` (mặc định — fingerprint `antigravity/hub/<ver>` **bắt buộc** để dùng Gemini 4 Argon trên daily-cloudcode-pa), `ide` (legacy, catalog cũ không có Argon), `desktop`, `cli`, `sdk`. |
| `OPENCODE_AGY_CLOAK_TOOLS` | `0` | Đặt `=1` để ngụy trang tên tools với hậu tố `_ide` và inject decoy tools của Antigravity IDE. |
| `OPENCODE_AGY_SENSITIVE_WORDS` | `RFC 2119` | Danh sách từ khóa nhạy cảm (cách nhau bởi dấu phẩy) cần chèn zero-width space để tránh bộ lọc máy chủ gây bare-429. |
| `OPENCODE_AGY_AUTO_FALLBACK` | `0` | Đặt `=1` để tự động fallback `gemini-4-argon-*` → `gemini-3.8-flash-*` cùng tier khi upstream trả 429/404 terminal. |
| `PI_AI_ANTIGRAVITY_VERSION` | *(auto)* | Ghi đè phiên bản client trong User-Agent (bỏ qua auto-track). |
| `ANTIGRAVITY_PROJECT_ID` | *(auto)* | Ghi đè chỉ định Project ID thay cho cơ chế tự phát hiện. |
| `OPENCODE_AGY_NO_KEEPALIVE` | `0` | Đặt `=1` để tắt Undici Connection Pool và dùng fetch mặc định. |
| `OPENCODE_AGY_NO_PREWARM` | `0` | Đặt `=1` để tắt cơ chế tiền kết nối TLS background. |
| `OPENCODE_AGY_HTTP2` | `0` | Đặt `=1` để kích hoạt giao thức HTTP/2 cho kết nối Undici. |
| `OPENCODE_AGY_DEBUG` | `0` | Đặt `=1` để xuất log request/response envelope lỗi ra `/tmp/agy-debug-*.json` (tự làm sạch token). |

---

## 📁 Cấu trúc Thư mục

```
antigravity-opencode/
├── install.sh            # Script cài đặt 1 bước tự động build và merge config
├── README.md             # Tài liệu dự án
└── antigravity-auth/     # Mã nguồn TypeScript Native của plugin
    ├── index.js          # Plugin entry (v2: {id, setup}; v1: server export)
    ├── scripts/
    │   └── bundle-aisdk.sh # Vendor @ai-sdk/google -> dist/vendor (v2 SDK loader)
    ├── src/
    │   ├── auth/         # OAuth PKCE, Token store, v2 credential resolve, Deterministic Project Discovery
    │   ├── models/       # Catalog, thinking level mapping, wire profiles & aliases
    │   ├── transport/    # Custom fetch, envelope, SSE unwrap, session trajectory
    │   ├── quota/        # Logic truy vấn và format quota thời gian thực
    │   ├── image/        # Xử lý sinh ảnh Gemini và lưu tệp an toàn
    │   ├── utils/        # Undici connection pool, TLS prewarm, schema dereferencing, system sanitizer
    │   ├── bin/          # CLI scripts (quota, image)
    │   ├── types/        # Định nghĩa TypeScript types
    │   ├── plugin-v2.ts  # OpenCode 2.x setup(): providers, models, sdk hook, tools
    │   ├── plugin.ts     # OpenCode 1.x Plugin entry point (dual provider + tools)
    │   └── index.ts      # Module exports
    ├── quota.js          # CLI quota runner
    ├── image.js          # CLI image runner
    ├── package.json      # Dependencies & scripts
    └── test/             # Bộ kiểm thử 51 unit tests (Node.js test runner)
```

---

## 🧪 Kiểm thử (Unit Tests)

Chạy bộ kiểm thử tự động:

```bash
cd antigravity-auth
npm test
```

Tất cả **51/51 unit tests trên 8 test suites** đảm bảo tính toàn vẹn:
- P1: Quota & Usage formatting
- P2: Image Generation module & Path traversal defense
- P3: Deterministic ProjectId & Environment overrides
- Plugin Tool Registration (`check_quota`, `generate_image`)
- OAuth PKCE helpers & Expiry buffers
- Transport envelope wrapping, tool adapters, SSE stream unwrap & cancel propagation
- Store sidecar isolation (`0600`)
- Native architecture & Anti-ban enhancements (system prompt sanitization, trajectory IDs, schema dereferencing)

---

## 📄 Bản quyền (License)

Dự án được phân phối cho mục đích cá nhân và cộng đồng phát triển cùng OpenCode.
