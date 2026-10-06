/**
 * Plain-language names for the MCP protocol requests an agent makes that are
 * not tool calls. The activity log stores the raw JSON-RPC method on an MCP
 * row ("server/discover"); that means nothing to most readers, so the console
 * shows what the request is for instead and keeps the raw name as a tooltip.
 */
const MCP_METHOD_LABELS: Record<string, { label: string; hint: string }> = {
  initialize: {
    label: "Connecting",
    hint: "The agent opened a session and agreed on a protocol version.",
  },
  "server/discover": {
    label: "Checking server",
    hint: "The agent asked what this server is and what it supports. No data was read or changed.",
  },
  "tools/list": {
    label: "Listing tools",
    hint: "The agent asked which tools it can use. No tool was run.",
  },
  ping: {
    label: "Ping",
    hint: "A keep-alive check from the agent.",
  },
  "tools/call": {
    label: "Tool call",
    hint: "The agent ran a tool.",
  },
};

/** The label for a stored MCP method, or the raw method when it is not one we know. */
export const mcpMethodInfo = (method: string | null | undefined) => {
  if (!method) return null;
  const first = method.split(",")[0].trim();
  if (MCP_METHOD_LABELS[first]) return { ...MCP_METHOD_LABELS[first], raw: method };
  if (first.startsWith("notifications/")) {
    return {
      label: "Client notice",
      hint: "A status message from the agent. No response is expected.",
      raw: method,
    };
  }
  return { label: method, hint: "MCP protocol request.", raw: method };
};
