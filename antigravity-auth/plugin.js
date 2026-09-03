/**
 * OpenCode plugin entry point.
 * OpenCode iterates through all exports and requires every export to be a plugin function.
 * We export both GoogleAntigravityAuthPlugin (primary: google-antigravity)
 * and AntigravityAliasAuthPlugin (alias: antigravity) for dual provider support.
 */
export {
  GoogleAntigravityAuthPlugin,
  AntigravityAliasAuthPlugin,
  GoogleAntigravityAuthPlugin as default,
} from "./dist/plugin.js";
