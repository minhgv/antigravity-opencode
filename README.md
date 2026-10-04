# Google Antigravity Auth Plugin for OpenCode (v1.2.1)

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![OpenCode](https://img.shields.io/badge/OpenCode-v1.14%2B-blue.svg)](https://opencode.ai)
[![Tests](https://img.shields.io/badge/Tests-46%2F46%20pass-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM-blue.svg)](https://www.typescriptlang.org/)

Plugin tích hợp xác thực **Google Antigravity OAuth** và **Cloud Code Assist API** trực tiếp vào **OpenCode** (v1.14+).

Cung cấp toàn quyền truy cập hệ sinh thái **Gemini (Flash, Pro, Thinking)**, **Claude 5.5** và **GPT OSS** qua tài khoản Google Antigravity: **không cần API Key**, **giữ nguyên native tool calls** (`@ai-sdk/google`), và đạt **wire-format parity 1:1** với client Antigravity chính thức.

---

## 🌟 Điểm nổi bật phiên bản v1.2.1

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
- 🧪 **46/46 Unit Tests pass 100%** trên 8 test suites (Node.js Test Runner).

---

## ⚡ Cài đặt Nhanh (1 bước)

Yêu cầu: **Node.js 18+** và **OpenCode v1.14.0+**.

Chạy lệnh cài đặt tự động (idempotent, an toàn, tự merge cấu hình vào `opencode.json` mà không ghi đè cài đặt khác):

```bash
bash install.sh
```

*(Tùy chọn: Đặt `OPENCODE_AGY_SKIP_CONFIG=1 bash install.sh` nếu chỉ muốn build và sao chép mã nguồn mà không sửa `opencode.json`).*

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
4. Hoàn tất! Thông tin xác thực được lưu an toàn tại `~/.local/share/opencode/auth.json` và sidecar metadata `~/.config/opencode/google-antigravity-meta.json` (phân quyền `0600`).

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
- `google-antigravity/gemini-3.8-flash-high` (Thế hệ mới nhất)
- `google-antigravity/gemini-pro-agent` (Coding & suy luận chuyên sâu)
- `google-antigravity/gemini-3.7-flash-high`
- Hoặc dùng tiền tố ngắn: `antigravity/gemini-3-flash`, `antigravity/gemini-pro-agent`...

---

## 🤖 Danh mục Mô hình (Model Catalog)

Plugin hỗ trợ đầy đủ các model với tính năng ánh xạ alias tự động (tránh lỗi 404 khi gọi model trần):

| Dòng mô hình | Model ID trong OpenCode | Wire Model ID | Thinking / Reasoning | Context / Output | Modalities |
|---|---|---|:---:|:---:|:---:|
| **Gemini 3.8 Flash** | `gemini-3.8-flash-high`<br>`gemini-3.8-flash-medium`<br>`gemini-3.8-flash-low` | `gemini-3.8-flash-high`<br>`gemini-3.8-flash-medium`<br>`gemini-3.8-flash-low` | `HIGH`<br>`MEDIUM`<br>`LOW` | 1M / 64k | text, image |
| **Gemini 3.7 Flash** | `gemini-3.7-flash-high`<br>`gemini-3.7-flash-medium`<br>`gemini-3.7-flash-low` | `gemini-3.7-flash-high`<br>`gemini-3.7-flash-medium`<br>`gemini-3.7-flash-low` | `HIGH`<br>`MEDIUM`<br>`LOW` *(floor)* | 1M / 64k | text, image |
| **Gemini 3.1 Pro** | `gemini-pro-agent`<br>`gemini-3.1-pro-high`<br>`gemini-3.1-pro-low` | `gemini-pro-agent`<br>`gemini-pro-agent`<br>`gemini-3.1-pro-low` | `HIGH`<br>`HIGH`<br>`LOW` | 1M / 64k | text, image |
| **Gemini 3.6 Flash** | `gemini-3.6-flash-high`<br>`gemini-3.6-flash-medium`<br>`gemini-3.6-flash-low` | `gemini-3.6-flash-high`<br>`gemini-3.6-flash-medium`<br>`gemini-3.6-flash-low` | `HIGH`<br>Tắt<br>`LOW` | 1M / 64k | text, image |
| **Gemini 3.5 / 3 Flash** | `gemini-3-flash-agent`<br>`gemini-3-flash`<br>`gemini-3.5-flash-lite` | `gemini-3-flash-agent`<br>`gemini-3-flash`<br>`gemini-3.5-flash-lite` | `HIGH`<br>`MINIMAL`<br>Tắt | 1M / 64k | text, image |
| **Gemini Image** | `gemini-3-pro-image`<br>`gemini-3.1-flash-image` | `gemini-3-pro-image`<br>`gemini-3.1-flash-image` | Tắt | 1M / 64k | text, image |
| **Claude Bridge** | `claude-opus-5-5-thinking`<br>`claude-sonnet-5-5-thinking` | *Giữ nguyên* | Bật | 1M / 64k | text, image |
| **GPT OSS** | `gpt-oss-120b` | `gpt-oss-120b` | Bật | 131k / 32k | text |

> 📌 **Lưu ý:** Các mã không hậu tố như `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.1-pro` đều được tự động route về phiên bản `HIGH`/agent tương ứng để đảm bảo an toàn.

---

## ⚙️ Biến Môi trường Tùy chỉnh (Environment Variables)

| Biến môi trường | Mặc định | Chức năng & Mô tả |
|---|---|---|
| `OPENCODE_AGY_UA_MODE` | `ide` | Định dạng User-Agent gửi tới Google API: `ide` (mặc định - auto track version qua electron-builder manifest), `desktop`, `cli`, `sdk`. |
| `OPENCODE_AGY_CLOAK_TOOLS` | `0` | Đặt `=1` để ngụy trang tên tools với hậu tố `_ide` và inject decoy tools của Antigravity IDE. |
| `OPENCODE_AGY_SENSITIVE_WORDS` | `RFC 2119` | Danh sách từ khóa nhạy cảm (cách nhau bởi dấu phẩy) cần chèn zero-width space để tránh bộ lọc máy chủ gây bare-429. |
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
    ├── src/
    │   ├── auth/         # OAuth PKCE, Token store, Deterministic Project Discovery
    │   ├── models/       # Catalog, thinking level mapping, wire profiles & aliases
    │   ├── transport/    # Custom fetch, envelope, SSE unwrap, session trajectory
    │   ├── quota/        # Logic truy vấn và format quota thời gian thực
    │   ├── image/        # Xử lý sinh ảnh Gemini và lưu tệp an toàn
    │   ├── utils/        # Undici connection pool, TLS prewarm, schema dereferencing, system sanitizer
    │   ├── bin/          # CLI scripts (quota, image)
    │   ├── types/        # Định nghĩa TypeScript types
    │   ├── plugin.ts     # OpenCode Plugin entry point (dual provider + tools)
    │   └── index.ts      # Module exports
    ├── quota.js          # CLI quota runner
    ├── image.js          # CLI image runner
    ├── package.json      # Dependencies (undici) & scripts
    └── test/             # Bộ kiểm thử 46 unit tests (Node.js test runner)
```

---

## 🧪 Kiểm thử (Unit Tests)

Chạy bộ kiểm thử tự động:

```bash
cd antigravity-auth
npm test
```

Tất cả **46/46 unit tests trên 8 test suites** đảm bảo tính toàn vẹn:
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
