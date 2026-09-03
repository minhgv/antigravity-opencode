#!/usr/bin/env node
/**
 * CLI tool to inspect Google Antigravity quota and remaining token limits.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { refreshAccessToken, toExpires, readMeta, DEFAULT_PROJECT_ID } from "../auth/index.js";
import { fetchFullQuotaReport, formatQuotaReport } from "../quota/index.js";

async function main() {
  const showModels = process.argv.includes("--models") || process.argv.includes("--all") || process.argv.includes("-m");
  const authPath = join(homedir(), ".local", "share", "opencode", "auth.json");

  if (!existsSync(authPath)) {
    console.error("❌ Không tìm thấy thông tin đăng nhập OpenCode.");
    console.error("👉 Vui lòng chạy lệnh: opencode auth login");
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
    console.error("❌ Chưa tìm thấy thông tin xác thực Google Antigravity.");
    console.error("👉 Vui lòng chạy lệnh: opencode auth login (chọn 'Google Antigravity')");
    process.exit(1);
  }

  let accessToken = agy.access;
  const refreshToken = agy.refresh;
  const expires = agy.expires || 0;

  // Auto-refresh token if expired or about to expire in 1 min
  if (expires && expires < Date.now() + 60_000 && refreshToken) {
    process.stdout.write("🔄 Access token đã hết hạn, đang tự động làm mới...\n");
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      agy.access = accessToken;
      if (refreshed.refresh_token) agy.refresh = refreshed.refresh_token;
      agy.expires = toExpires(refreshed.expires_in ?? 3600);

      if (authData["google-antigravity"]) authData["google-antigravity"] = agy;
      if (authData["antigravity"]) authData["antigravity"] = agy;
      writeFileSync(authPath, JSON.stringify(authData, null, 2));
    } catch (err: any) {
      console.error("⚠️ Làm mới token thất bại:", err.message);
    }
  }

  const meta = readMeta();
  const projectId = meta.projectId || agy.accountId || DEFAULT_PROJECT_ID;

  process.stdout.write("⏳ Đang truy vấn quota từ Google Cloud Code Assist...\n");
  try {
    const report = await fetchFullQuotaReport(accessToken, projectId);
    console.log("\n" + formatQuotaReport(report, { showModels }));
  } catch (err: any) {
    console.error("❌ Không thể lấy thông tin Quota:", err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
