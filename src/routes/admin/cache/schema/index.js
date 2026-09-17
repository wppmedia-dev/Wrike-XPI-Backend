/**
 * Validation for the cache routes, shared by the admin console and the portal
 * (src/routes/admin/cache and src/routes/portal/cache call the same handlers
 * against the same Redis keys).
 *
 * These routes read their payload defensively (String(...) with defaults,
 * Array.isArray on the key list, a trim and a filter), so nothing here was
 * crashing. A schema is still the difference between "we cope with whatever
 * arrives" and "the shape is declared": a mistyped field is refused rather than
 * silently read as empty, and a bulk delete cannot be handed a key list that is
 * not a list.
 *
 * The keys are Redis key names, not identifiers: they are strings with no
 * format to check, so the constraint is on the shape (a non-empty array of
 * non-empty strings) and on the count, which is capped here rather than
 * discovered by the server while it deletes.
 */

/** The most keys one bulk delete may carry. */
const MAX_KEYS = 500;

export const BulkDeleteSchema = {
  schema: {
    body: {
      type: "object",
      required: ["keys"],
      properties: {
        keys: {
          type: "array",
          minItems: 1,
          maxItems: MAX_KEYS,
          items: { type: "string", minLength: 1, maxLength: 512 },
        },
      },
      additionalProperties: false,
    },
  },
};

/** GET /detail — one key, in the query string. */
export const DetailQuerySchema = {
  schema: {
    querystring: {
      type: "object",
      required: ["key"],
      properties: { key: { type: "string", minLength: 1, maxLength: 512 } },
    },
  },
};

/** DELETE / — one key, in the query string. */
export const DeleteKeySchema = {
  schema: {
    querystring: {
      type: "object",
      required: ["key"],
      properties: { key: { type: "string", minLength: 1, maxLength: 512 } },
    },
  },
};

/** GET / — an optional pattern and page size. */
export const ListQuerySchema = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        pattern: { type: "string", maxLength: 512 },
        limit: { type: "integer", minimum: 1, maximum: 1000 },
      },
    },
  },
};
