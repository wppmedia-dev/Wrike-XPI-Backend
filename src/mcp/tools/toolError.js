/**
 * The Error an MCP tool throws when its handler fails.
 *
 * MCP carries only the message to the agent, but the activity log row for the
 * request needs the status too (src/mcp/index.js reports it, src/plugins/mcp.js
 * writes it), so the handler's `statusCode` is kept on the Error instead of
 * being dropped by `new Error(message)`.
 */
export const toolError = (err, fallbackMessage) => {
  const error = new Error(err?.message || fallbackMessage);
  if (err?.statusCode) error.statusCode = err.statusCode;
  return error;
};
