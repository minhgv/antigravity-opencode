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
- `OPENCODE_AGY_DEBUG=1`: Bật ghi log chi tiết request/response vào thư mục tạm `/tmp/agy-debug-*.json` khi gặp lỗi 400/500.

---

## 🔒 6. Lưu ý Bảo mật & Khắc phục Lỗi

1. **Phân quyền Tệp Sidecar**: Plugin tự động lưu mã `projectId` vào `~/.config/opencode/google-antigravity-meta.json` với quyền bảo mật `0600`.
2. **Unofficial Provider**: Antigravity OAuth là tích hợp không chính thức (Unofficial). Khuyên dùng tài khoản cá nhân/non-critical.
3. **Sự cố Lỗi 400 (INVALID_ARGUMENT)**:
   - Đảm bảo chọn đúng mô hình `google-antigravity/gemini-pro-agent` thay vì tên alias cũ.
   - Nếu gặp lỗi, chạy lệnh `opencode auth logout` rồi đăng nhập lại bằng `opencode auth login`.

---

## 🧪 7. Chạy Unit Tests (Dành cho Developer)

Nếu bạn muốn đóng góp hoặc phát triển thêm plugin:
```bash
cd ~/.openclaw/workspace-main/projects/google-antigravity-auth
node --test test/*.test.js
```
*(Yêu cầu bộ 20/20 unit tests phải pass).*
