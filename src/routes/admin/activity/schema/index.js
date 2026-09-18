export const ListSchema = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        env_id: { type: "string", format: "uuid" },
        // Set by the API Tokens table's "Activity logs" row action, so the
        // log opens filtered to one token instead of its whole environment.
        token_id: { type: "string", format: "uuid" },
        // The console's one search box. Free text across the columns a person
        // arrives with: the caller's email, or the reference id from an error
        // message. Both are matched as substrings, so a partial reference is
        // enough.
        search: { type: "string", maxLength: 320 },
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
