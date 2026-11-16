// PUT /admin/settings/mcp-tokens. The range and ordering rules live in
// src/utils/mcpTokenPolicy.js and are enforced there; this only checks shape.
export const SetMcpTokenLifetimesSchema = {
  schema: {
    body: {
      type: "object",
      required: ["accessTtlSeconds", "refreshTtlSeconds"],
      properties: {
        accessTtlSeconds: { type: "integer" },
        refreshTtlSeconds: { type: "integer" },
      },
    },
  },
};
