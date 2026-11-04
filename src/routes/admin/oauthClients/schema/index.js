import { MAX_LIST_LIMIT } from "../../../../controllers/oauthClients";

/** :id must be a UUID: a typo is a 400 before any query, not a Postgres 500. */
export const IdParamSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
  },
};

export const ListSchema = {
  schema: {
    querystring: {
      type: "object",
      properties: {
        include_revoked: { type: "string", enum: ["true", "false", "1", "0"] },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIST_LIMIT },
        offset: { type: "integer", minimum: 0 },
      },
    },
  },
};
