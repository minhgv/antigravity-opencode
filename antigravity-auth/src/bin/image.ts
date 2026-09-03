#!/usr/bin/env node
/**
 * CLI tool to generate images using Gemini / Imagen via Google Antigravity.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { refreshAccessToken, toExpires, readMeta, DEFAULT_PROJECT_ID } from "../auth/index.js";
import { generateAntigravityImage } from "../image/index.js";

function parseArgs(args: string[]): {
  prompt: string;
  ratio?: string;
  model?: string;
  path?: string;
} {
  const res: { prompt: string; ratio?: string; model?: string; path?: string } = { prompt: "" };
  const rest: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if ((a === "--ratio" || a === "-r") && next) {
      res.ratio = next;
      i++;
    } else if ((a === "--model" || a === "-m") && next) {
      res.model = next;
      i++;
    } else if ((a === "--path" || a === "-p" || a === "--out" || a === "-o") && next) {
      res.path = next;
      i++;
    } else if (a === "--help" || a === "-h") {
      console.log(`
Cách sử dụng:
  node image.js --prompt "mô tả ảnh" [options]

Tùy chọn:
  --prompt, -p   Mô tả bức ảnh bạn muốn tạo (bắt buộc)
  --ratio, -r    Tỉ lệ khung hình: 1:1 (mặc định), 16:9, 9:16, 4:3, 3:4, 2:3, 3:2, 21:9
  --model, -m    Model ID: gemini-3-pro-image (mặc định), gemini-3.1-flash-image
  --out, -o      Đường dẫn lưu file ảnh (mặc định: .opencode/generated-images/...)
      `);
      process.exit(0);
    } else {
      rest.push(a);
    }
  }

  res.prompt = rest.join(" ");
  return res;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt.trim()) {
    console.error("❌ Vui lòng cung cấp mô tả ảnh: node image.js --prompt \"mô tả ảnh\"");
    process.exit(1);
  }

  const authPath = join(homedir(), ".local", "share", "opencode", "auth.json");
  if (!existsSync(authPath)) {
    console.error("❌ Không tìm thấy thông tin đăng nhập OpenCode (chạy 'opencode auth login' trước).");
    process.exit(1);
  }

  let authData: Record<string, any> = {};
  try {
    authData = JSON.parse(readFileSync(authPath, "utf8"));
  } catch (err: any) {
    console.error("❌ Lỗi khi đọc auth.json:", err.message);
    process.exit(1);
  }

  const agy = authData["google-antigravity"] || authData["antigravity"];
  if (!agy || !agy.access) {
    console.error("❌ Chưa đăng nhập Google Antigravity. Chạy: opencode auth login");
    process.exit(1);
  }

  let accessToken = agy.access;
  const refreshToken = agy.refresh;
  const expires = agy.expires || 0;

  if (expires && expires < Date.now() + 60_000 && refreshToken) {
    process.stdout.write("🔄 Đang làm mới access token...\n");
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      agy.access = accessToken;
      if (refreshed.refresh_token) agy.refresh = refreshed.refresh_token;
      agy.expires = toExpires(refreshed.expires_in ?? 3600);
      writeFileSync(authPath, JSON.stringify(authData, null, 2));
    } catch (err: any) {
      console.error("⚠️ Làm mới token thất bại:", err.message);
    }
  }

  const meta = readMeta();
  const projectId = meta.projectId || agy.accountId || DEFAULT_PROJECT_ID;

  process.stdout.write(`🎨 Đang tạo ảnh với Gemini Antigravity (Tỉ lệ: ${args.ratio || "1:1"})...\n`);
  try {
    const result = await generateAntigravityImage({
      prompt: args.prompt,
      accessToken,
      projectId,
      aspectRatio: args.ratio,
      model: args.model,
      path: args.path,
    });

    console.log(`\n✅ Tạo ảnh thành công (${result.model})!`);
    for (const p of result.savedPaths) {
      console.log(`🖼️  Đã lưu tại: ${p}`);
    }
  } catch (err: any) {
    console.error("❌ Sinh ảnh thất bại:", err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
