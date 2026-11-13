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

// PUT /admin/settings/cross-token-access
export const SetCrossTokenAccessSchema = {
  schema: {
    body: {
      type: "object",
      required: ["enabled"],
      properties: { enabled: { type: "boolean" } },
    },
  },
};
