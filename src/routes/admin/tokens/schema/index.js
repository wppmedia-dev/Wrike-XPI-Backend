// Params shared by every /:id route in this module.
export const IdParamSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
  },
};

/**
 * GET /tokens: the list's committed filters, one query parameter per control.
 *
 * Every value is optional and an omitted one means "do not narrow by this",
 * which is why the console leaves blank controls out of the query string.
 * A blank value is accepted anyway and means the same thing, because that is
 * what `parseTokenFilters` does with it (src/utils/tokenFilters.js) and a form
 * posting an unset select would otherwise be a hard 400 for a request that says
 * nothing at all. A value that is neither blank nor a member of its enum is
 * still refused, so a typo is loud rather than silently ignored.
 *
 * `token_id` is a string and not a uuid because the filter is a substring: the
 * console lets an admin paste the first few characters of an id. `env_id` is a
 * uuid, and the nil UUID is meaningful in it (see NO_ENVIRONMENT in
 * src/utils/tokenFilters.js).
 */
export const TOKEN_FILTER_QUERY = {
  env_id: { type: "string", format: "uuid" },
  token_id: { type: "string", maxLength: 64 },
  client: { type: "string", maxLength: 120 },
  account_id: { type: "string", maxLength: 120 },
  creator: { type: "string", maxLength: 200 },
  access: {
    type: "string",
    enum: ["", "unrestricted", "restricted", "none"],
  },
  validity: {
    type: "string",
    enum: ["", "expired", "soon", "valid", "unknown"],
  },
  updated: { type: "string", enum: ["", "24h", "7d", "30d", "never"] },
  status: { type: "string", enum: ["", "active", "inactive"] },
  search: { type: "string", maxLength: 200 },
};

export const ListSchema = {
  schema: {
    querystring: { type: "object", properties: TOKEN_FILTER_QUERY },
  },
};

// PUT /admin/tokens/:id/permissions: whole-matrix replace.
//
// `permissions` is deliberately left open rather than spelled out as
// module-by-action properties: the vocabulary lives in
// src/utils/tokenPermissionCatalog.js, is fetched by the console from the
// catalog endpoint, and the controller normalises whatever arrives (discarding
// unknown modules and forcing off actions a module cannot express). Mirroring
// it here would be a third copy to keep in step, and JSON Schema cannot say
// "these keys are whatever the catalogue currently declares".
export const SetPermissionsSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
    body: {
      type: "object",
      required: ["permissions"],
      properties: {
        permissions: { type: "object", additionalProperties: true },
      },
    },
  },
};

// PUT /admin/tokens/:id/status: the Active/Inactive switch in the list.
export const SetStatusSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string", format: "uuid" } },
    },
    body: {
      type: "object",
      required: ["is_active"],
      properties: { is_active: { type: "boolean" } },
    },
  },
};
