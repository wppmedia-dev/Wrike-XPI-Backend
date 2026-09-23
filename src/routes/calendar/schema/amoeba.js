export const CalendarAmoebaSchema = {
  schema: {
    params: {
      type: "object",
      required: ["master_slug", "service_slug"],
      properties: {
        // The names the amoeba data uses: a mapping row is keyed by "module
        // slug" and "service slug" in Datahub, and a master slug is what
        // selects the entity. Accepting the mapping's own vocabulary here
        // means the URL a caller is told to use is the URL the mapping is
        // described with.
        master_slug: { type: "string" },
        service_slug: { type: "string" },
      },
    },
  },
};

// Same as CalendarAmoebaSchema, for the wildcard route that additionally
// carries a remaining path after the service slug (e.g. .../tasks). Fastify
// puts a `*` param's value under the "*" key, so it's declared here too.
export const CalendarAmoebaWildcardSchema = {
  schema: {
    params: {
      type: "object",
      required: ["master_slug", "service_slug"],
      properties: {
        master_slug: { type: "string" },
        service_slug: { type: "string" },
        "*": { type: "string" },
      },
    },
  },
};
