/**
 * The Activity Log's "Client" filter options — mirrors the detection list in
 * src/utils/agentIdentity.js (the labels the server derives and returns as
 * each row's `client` field). Kept as a separate, hand-copied list rather
 * than fetched from the server: it's a small, rarely-changing vocabulary,
 * and every other filter's options on these pages (surface, result) are
 * already inline constants for the same reason.
 */
export const AGENT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All clients" },
  { value: "claude_code", label: "Claude Code" },
  { value: "claude", label: "Claude" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "copilot", label: "GitHub Copilot" },
  { value: "cursor", label: "Cursor" },
  { value: "windsurf", label: "Windsurf" },
  { value: "vscode", label: "VS Code" },
  { value: "jetbrains", label: "JetBrains" },
  { value: "cline", label: "Cline" },
  { value: "chrome", label: "Chrome" },
  { value: "edge", label: "Edge" },
  { value: "firefox", label: "Firefox" },
  { value: "safari", label: "Safari" },
  { value: "postman", label: "Postman" },
  { value: "curl", label: "curl" },
  { value: "python", label: "Python" },
  { value: "node", label: "Node.js" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown" },
];
