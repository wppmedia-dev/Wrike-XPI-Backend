export const ListSchema = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        env_id: { type: "string", format: "uuid" },
        // Set by the API Tokens table's "Activity logs" row action, so the
        // log opens filtered to one token instead of its whole environment.
        token_id: { type: "string", format: "uuid" },
        actor_email: { type: "string", maxLength: 320 },
        // The reference a caller was shown with an error response, so a report
        // can be turned into the row behind it. Free text rather than a
        // pattern: it gets typed by hand from a screenshot.
        reference: { type: "string", maxLength: 32 },
        surface: { type: "string", enum: ["rest", "mcp"] },
        allowed: { type: "string", enum: ["true", "false"] },
        from: { type: "string" },
        to: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
        offset: { type: "integer", minimum: 0 },
      },
    },
  },
};

export const SummarySchema = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        env_id: { type: "string", format: "uuid" },
        token_id: { type: "string", format: "uuid" },
        since: { type: "string" },
      },
    },
  },
};
