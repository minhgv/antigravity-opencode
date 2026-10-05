/**
 * OpenCode plugin entry point (v1 + v2).
 *
 * V2 runtime (`plugins: ["./plugins/antigravity-auth"]`) imports this directory
 * and requires a default export shaped { id, setup } or { id, effect }.
 * `server` is kept for the V1 plugin service (`plugin: [...file]` config).
 */
import { setup } from "./dist/plugin-v2.js";
import { GoogleAntigravityAuthPlugin } from "./dist/plugin.js";

export default {
  id: "antigravity-auth",
  setup,
  server: GoogleAntigravityAuthPlugin,
};
