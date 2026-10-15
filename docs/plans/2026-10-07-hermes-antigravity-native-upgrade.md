# Kế hoạch nâng cấp hermes_antigravity_native đồng bộ với antigravity-opencode (v1.3.0+)

**Work ID**: `2026-10-07-hermes-antigravity-native-upgrade`  
**Target Repository**: `~/code/GitHub/hermes_antigravity_native`  
**Reference Repository**: `/Users/giapminh79/code/GitHub/antigravity-opencode`  
**Author**: Pi (OMP Autonomous Coding Assistant)  
**Trạng thái**: Draft / Advisor Consulted (Đã tiếp thu chỉ đạo kiến trúc)

---

## 1. Context

### Bối cảnh
`hermes_antigravity_native` là provider plugin in-process cho Hermes Agent (CLI & Telegram Gateway), chuyển đổi OpenAI chat completion requests sang Google Cloud Code Assist (Antigravity upstream API) mà không cần mở TCP proxy port. Hiện tại, `hermes_antigravity_native` đang ở phiên bản kiến trúc cũ:
- Danh mục model vẫn chủ yếu dùng Claude 4.x (Opus/Sonnet 4.5 & 4.6) và Gemini 3.5 Flash cũ.
- Thiếu dòng mô hình **Claude 5.5** (Opus & Sonnet 5.5) với phân bổ effort tier (-high, -medium, -low).
- Thiếu các biến thể **Gemini 3.8 / 3.7 / 3.6 Flash Tiered** (auto reasoning).
- Thiếu các mã enum telemetry nội bộ mới (`MODEL_PLACEHOLDER_M*`) dẫn đến nguy cơ bị máy chủ Google nhận diện client bất thường hoặc định tuyến vào pool giới hạn.
- Cấu hình HTTP endpoint trỏ vào URL cũ (`daily-cloudcode-pa.googleapis.com` thay vì `cloudcode-pa.googleapis.com` prod).
- Thiếu các header tiêu chuẩn của client Antigravity IDE (`x-request-source: local`, `Client-Metadata`, version auto-tracking `2.19.1`).
- Thiếu công cụ kiểm tra Quota thời gian thực (`cli.py quota`) và tính năng sinh ảnh (`gemini-*-image`).

### Mục tiêu
Nâng cấp toàn diện `hermes_antigravity_native` đạt chuẩn parity 1:1 với phiên bản mới nhất của `antigravity-opencode`, đảm bảo tính ổn định, anti-fingerprinting tối đa và hỗ trợ toàn bộ các mô hình thế hệ mới nhất của Antigravity.

### Non-Goals
- Không thay đổi kiến trúc in-process `httpx` send interceptor của Hermes (giữ nguyên zero-port).
- Không phá vỡ tương thích ngược với các file config của Hermes Agent hiện tại.
- Không đưa dependency ngoài chuẩn vào package (chỉ dùng `httpx`, `cryptography` nếu cần, và thư viện chuẩn Python).

---

## 2. Approach

### Kiến trúc Kỹ thuật & Nguyên tắc
1. **Catalog & Routing Synchronization**:
   - Đồng bộ hoàn toàn `ANTIGRAVITY_MODEL_CATALOG` với Antigravity 2.x Language Server (`cascadeModelConfigData.clientModelConfigs`).
   - Bổ sung Claude 5.5 series (`claude-opus-5-5-*`, `claude-sonnet-5-5-*`).
   - Thiết lập bảng định tuyến tương thích ngược (`MODEL_ID_ALIASES`): map Claude 4.x $\rightarrow$ Claude 5.5; map Gemini 3.5 Flash $\rightarrow$ Gemini 3.6 Flash.
   - Trần giới hạn `maxOutputTokens`: áp dụng `min(user_max_tokens, 64000)` cho toàn bộ wire ID của Claude (chống lỗi HTTP 400 mà vẫn tôn trọng yêu cầu nhỏ hơn của người dùng).
   - Ngăn chặn rò rỉ `thinkingConfig` vào Claude wire requests (do Claude trên Cloud Code Assist mã hóa effort tier trực tiếp qua hậu tố wire ID).
2. **Telemetry & Anti-Fingerprinting Parity**:
   - Mở rộng `ANTIGRAVITY_MODEL_ENUM` với các mã nội bộ đã xác minh chính xác:
     - Gemini 3.8 Flash: `MODEL_PLACEHOLDER_M318` (high), `M319` (medium), `M320` (low), `M322` (tiered).
     - Gemini 3.7 Flash: `MODEL_PLACEHOLDER_M298` (high), `M299` (medium), `M300` (low), `M301` (tiered).
     - Gemini 3.6 Flash: `MODEL_PLACEHOLDER_M71` (high), `M72` (medium), `M73` (low), `MODEL_PLACEHOLDER_M196` (tiered).
     - Gemini 3.1 Pro: `MODEL_PLACEHOLDER_M16` (`gemini-pro-agent`), `M36` (`gemini-3.1-pro-low`), `M37` (`gemini-3.1-pro-high`).
     - Claude 5.5: Hỗ trợ nhãn telemetry `used_claude = "1"`; các mã `M400..M405` cấu hình sẵn nhưng không ép buộc gửi nếu upstream chấp nhận request không có enum.
     - Cascade Checkpointer & Image: `MODEL_PLACEHOLDER_M50` (3.1-flash-lite), `MODEL_PLACEHOLDER_M21` (3.1-flash-image).
   - Chuẩn hóa nhãn `labels`: `used_claude = "1"`, loại bỏ `requestType: "agent"` khỏi request envelope để không bị rơi vào rate-limit bucket hạn chế.
3. **Transport & Connection Layer**:
   - Đặt `DEFAULT_ENDPOINT = "https://cloudcode-pa.googleapis.com"` (Prod) và fallback `https://daily-cloudcode-pa.sandbox.googleapis.com`.
   - Bổ sung `x-request-source: local` và `Client-Metadata: {"ideType":"ANTIGRAVITY","platform":"...","pluginType":"GEMINI"}`.
   - Nâng cấp phiên bản fallback lên `2.19.1` và tích hợp cơ chế async/sync fetch version manifest từ `https://antigravity-hub-auto-updater-974169037036.us-central1.run.app/manifest/latest-arm64-mac.yml`.
4. **Tooling & CLI Enhancements**:
   - Bổ sung lệnh `python3 -m hermes_antigravity_native.cli quota` và `quota --models` hiển thị progress bar và thời gian reset tương tự `quota.js`.
   - Bổ sung module tạo ảnh `image.py` (hỗ trợ `gemini-3-pro-image`, `gemini-3.1-flash-image`).

---

## 3. Critical Files and Ownership

| STT | File trong `hermes_antigravity_native` | Trách nhiệm thay đổi | Gói / Module |
| :---: | :--- | :--- | :--- |
| 1 | `hermes_antigravity_native/models.py` | Cập nhật catalog, alias map, routing matrix, model enum dictionary (M318..M405). | Core Catalog |
| 2 | `hermes_antigravity_native/http.py` | Đổi endpoint Prod/Sandbox, bổ sung Client-Metadata, x-request-source, client version manifest tracking. | Transport HTTP |
| 3 | `hermes_antigravity_native/security.py` | Cập nhật `antigravity_request_envelope`, nhãn `used_claude = "1"`, model_enum injection, chặn `requestType: "agent"`. | Security & Envelope |
| 4 | `hermes_antigravity_native/stream.py` | Chặn leak `thinkingConfig` cho Claude 5.5, pin 64k tokens cho Claude, giữ `thoughtSignature` an toàn. | Streaming & Conversion |
| 5 | `hermes_antigravity_native/auth.py` | Thêm fallback `stableProjectId` (UUIDv5 từ email) khi discovery trả về rỗng. | Auth & Discovery |
| 6 | `hermes_antigravity_native/cli.py` | Bổ sung subcommand `quota` và `quota --models` vào CLI. | CLI Management |
| 7 | `hermes_antigravity_native/image.py` | (Tạo mới) Module tạo ảnh Gemini Image cho Hermes tools. | Image Generation |
| 8 | `tests/test_native.py` | Cập nhật và bổ sung test suite bao phủ toàn bộ tính năng và model mới. | Verification Suite |
| 9 | `README.md` & `plugin.yaml` | Cập nhật tài liệu, danh mục model 5.5/3.8, và hướng dẫn CLI mới. | Documentation |

---

## 4. Verification

Mỗi tiêu chí kiểm thử có mã định danh ổn định (`AC-XX`):

- **`AC-01`**: Danh mục model trong `models.py` chứa đầy đủ Gemini 3.8/3.7/3.6 Flash tiers, Gemini 3.1 Pro tiers, Claude Opus/Sonnet 5.5 tiers, và GPT-OSS.
- **`AC-02`**: Hàm `resolve_wire_model_id()` chuyển đổi chính xác các alias cũ (`claude-opus-4-6*` $\rightarrow$ `claude-opus-5-5-*`, `gemini-3.5-flash*` $\rightarrow$ `gemini-3.6-flash-*`).
- **`AC-03`**: Bảng `ANTIGRAVITY_MODEL_ENUM` chứa ánh xạ chính xác: `M318, M319, M320, M322` (Gemini 3.8 Flash), `M298, M299, M300, M301` (Gemini 3.7 Flash), `M71, M72, M73, M196` (Gemini 3.6 Flash), `M16, M36, M37` (Gemini 3.1 Pro).
- **`AC-04`**: Request envelope gửi cho Claude 5.5 mang `used_claude = "1"`, ghim trần `maxOutputTokens = min(user_tokens, 64000)`, và không chứa `thinkingConfig`.
- **`AC-05`**: Request headers chứa `x-request-source: local`, `Client-Metadata` hợp lệ và `User-Agent` mang phiên bản `2.19.1+`.
- **`AC-06`**: Endpoint danh sách kết nối ưu tiên `https://cloudcode-pa.googleapis.com` đầu tiên, loại bỏ URL `daily-cloudcode-pa.googleapis.com` hỏng.
- **`AC-07`**: Lệnh CLI `python3 -m hermes_antigravity_native.cli quota` và `--models` chạy thành công, hiển thị chính xác các quota bucket và models.
- **`AC-08`**: Toàn bộ unit tests trong `tests/test_native.py` vượt qua 100% (tối thiểu 30 tests bao phủ các case mới).

---

## 5. Execution Checklist

### Wave 1: Core Models, Aliases, Generation Contract & Envelope (Hợp đồng toàn vẹn)
- [ ] **T-01** (Ánh xạ `AC-01`, `AC-02`, `AC-03`): Cập nhật `hermes_antigravity_native/models.py`:
  - Thêm Gemini 3.8 Flash (`high`, `medium`, `low`, `tiered`).
  - Thêm Gemini 3.7 Flash (`high`, `medium`, `low`, `tiered`).
  - Thêm Gemini 3.6 Flash (`high`, `medium`, `low`, `tiered`).
  - Thêm Claude Opus 5.5 (`high`, `medium`, `low`) và Claude Sonnet 5.5 (`high`, `medium`, `low`).
  - Cập nhật `MODEL_ID_ALIASES` redirect Claude 4.x và Gemini 3.5 Flash sang 5.5 và 3.6.
  - Cập nhật `ANTIGRAVITY_MODEL_ENUM` với danh sách mã rời rạc chính xác (`M318..M322`, `M298..M301`, `M71, M72, M73, M196`, `M16, M36, M37`).
- [ ] **T-02** (Ánh xạ `AC-04`): Cập nhật `hermes_antigravity_native/security.py` và `stream.py`:
  - Sửa `used_claude` và `used_claude_conservative` thành `"1"` (chuỗi) khi gọi Claude model.
  - Đảm bảo `labels.model_enum` được inject chính xác từ `ANTIGRAVITY_MODEL_ENUM` cho Gemini models.
  - Đảm bảo `requestType: "agent"` không xuất hiện trong request envelope.
  - Trong `stream.py` (`sanitize_generation_config`): nếu là Claude model, ghim trần `maxOutputTokens = min(max_output_tokens or 64000, 64000)` và loại bỏ `thinkingConfig`.

### Wave 2: Transport, Client Metadata & Version Tracking
- [ ] **T-03** (Ánh xạ `AC-05`, `AC-06`): Cập nhật `hermes_antigravity_native/http.py`:
  - Chuẩn hóa `DEFAULT_ENDPOINT = "https://cloudcode-pa.googleapis.com"`.
  - Thay thế fallback list: `cloudcode-pa` (prod) và `daily-cloudcode-pa.sandbox.googleapis.com`.
  - Thêm header `x-request-source: local`.
  - Thêm header `Client-Metadata: {"ideType":"ANTIGRAVITY","platform":"...","pluginType":"GEMINI"}`.
  - Thêm hàm `get_antigravity_version()` với cơ chế TTL caching (24h), non-blocking fallback tĩnh `2.19.1` an toàn (fail-open không làm gãy inference).
### Wave 3: Quota CLI Tooling & Stable Project ID
- [ ] **T-05** (Ánh xạ `AC-07`): Cập nhật `hermes_antigravity_native/cli.py` và `auth.py`:
  - Trong `auth.py`: thêm thuật toán tạo `stableProjectId` (UUIDv5 qua `uuid.uuid5(uuid.NAMESPACE_DNS, email)`) khi không tìm thấy project ID.
  - Trong `cli.py`: bổ sung lệnh `quota` (`--models`, `--all`) truy vấn trực tiếp Google API và in bảng hạn mức trực quan.
- [ ] **T-06**: Tạo file `hermes_antigravity_native/image.py` cung cấp hàm sinh ảnh từ Gemini Image models.

### Wave 4: Test Suite & Documentation
- [ ] **T-07** (Ánh xạ `AC-08`): Mở rộng `tests/test_native.py`:
  - Test case kiểm tra resolution của toàn bộ catalog model mới (3.8, 3.7, 3.6, Claude 5.5).
  - Test case kiểm tra alias fallback từ Claude 4.x và Gemini 3.5.
  - Test case kiểm tra `model_enum` chính xác trong envelope.
  - Test case kiểm tra Claude generationConfig không chứa `thinkingConfig` và output cap = 64k.
  - Test case kiểm tra các headers `Client-Metadata` và `x-request-source`.
  - Chạy `pytest tests/` hoặc `python3 -m unittest discover tests/`.
- [ ] **T-08**: Cập nhật `README.md` và `plugin.yaml` của `hermes_antigravity_native`:
  - Cập nhật bảng Model Catalog mới.
  - Hướng dẫn lệnh `python3 -m hermes_antigravity_native.cli quota`.
  - Cập nhật version lên `v1.3.0`.

---

## 6. Evidence and Handoff

### Baseline Context
- Repo hiện tại của `hermes_antigravity_native`: đã có kiến trúc module tách rời (`models.py`, `http.py`, `stream.py`, `security.py`), có 21 unit tests chạy bằng `unittest`.
- Reference repo `antigravity-opencode`: vừa hoàn thiện port v1.3.0, 51/51 tests pass, wire-format parity đạt 100%.

### Verification Commands dự kiến
```bash
cd ~/code/GitHub/hermes_antigravity_native
python3 -m unittest discover tests/ -v
python3 -m hermes_antigravity_native.cli quota --models
```

### Residual Risks
- Các tài khoản Google có hạn mức riêng biệt cho nhóm Claude 5.5 (pool chung đang ở mức 2.2% như đã kiểm tra thực tế) $\rightarrow$ Cần thông báo rõ cho người dùng trong CLI khi hạn mức Claude cạn kiệt để tự động chuyển sang Gemini 3.8/3.6 Flash.
- Python runtime trên máy người dùng cần có sẵn `httpx` (đã có trong virtualenv/setup.py).

---

## 7. Assumptions and Contingencies

1. **Giả định**:
   - `~/code/GitHub/hermes_antigravity_native` là repo git local sạch và có thể chỉnh sửa trực tiếp.
   - Môi trường Python hỗ trợ `unittest` chuẩn và `httpx`.
2. **Kế hoạch dự phòng (Contingencies)**:
   - Nếu upstream Google thay đổi thêm mã enum cho Claude, plugin vẫn fallback gửi request với nhãn `used_claude = "1"` mà không chặn kết nối.
   - Nếu manifest version URL tạm thời không truy cập được, hệ thống tự động dùng phiên bản fallback `2.19.1`.

---

## 8. Advisor Feedback & Architectural Directives

Vào 2026-10-07, Chief Architect (Advisor) đã thực hiện thẩm định kiến trúc độc lập đối với bản kế hoạch này:

1. **Hợp nhất hợp đồng suy luận trong Wave 1**: Đưa việc ghim trần 64k tokens và loại bỏ `thinkingConfig` trong `stream.py` vào cùng Wave 1 với `models.py` và `security.py` để đảm bảo hợp đồng `Model -> Resolution -> GenerationConfig -> Envelope` được đóng kín và kiểm thử hoàn chỉnh trước khi chuyển sang tầng mạng.
2. **Làm rõ trần token Claude**: Khẳng định dùng `min(user_tokens, 64000)` thay vì ép cứng mọi request thành 64000, bảo toàn yêu cầu output ngắn của người dùng.
3. **Chính sách Telemetry Claude**: Xác nhận nhãn `used_claude: "1"` là bắt buộc; các mã `M400..M405` chỉ inject khi có bằng chứng ràng buộc, tránh giả định sai về yêu cầu của server.
4. **Bảo toàn Project ID Fallback**: Sử dụng `rising-fact-p41fc` làm project fallback hợp lệ được server Google chấp nhận; không tự sinh UUID ngẫu nhiên thay cho project Google khi gọi API.
5. **Version Tracking an toàn**: Yêu cầu I/O fetch manifest version phải non-blocking, có timeout ngắn (3s) và TTL cache, luôn fail-open về fallback `2.19.1` để không bao giờ ảnh hưởng đến luồng chat của Hermes CLI hoặc Telegram Gateway.
6. **Tách biệt biến thể Tiered**: Coi `gemini-*-flash-tiered` là biến thể tự thích ứng độc lập, không ép buộc ánh xạ về `-high` hay `-low`.
