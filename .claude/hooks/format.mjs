// PostToolUse hook: auto-format files Claude edits with Prettier (if installed).
// Cross-platform (Windows/macOS/Linux). Never blocks Claude: always exits 0.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    const file = data?.tool_input?.file_path;
    if (!file || !/\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|html|ya?ml)$/.test(file)) return;
    if (!existsSync("node_modules/.bin") ) return; // prettier not installed yet
    spawnSync("npx", ["--no-install", "prettier", "--write", "--log-level", "silent", file], {
      stdio: "ignore",
      shell: process.platform === "win32",
    });
  } catch {
    /* ignore */
  }
});
