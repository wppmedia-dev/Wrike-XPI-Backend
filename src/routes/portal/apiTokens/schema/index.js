/**
 * Request validation for /api/v1/portal/api-tokens.
 *
 * Same shape as the admin console's token schemas, with one addition: the
 * portal's create action needs the environment to issue a token for, and that
 * environment has to be one the caller can see (checked in the route, not
 * here, since it needs a database lookup).
 */

const ID_PARAM = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

// POST /portal/api-tokens/connect: which environment to issue a token for.
export const ConnectSchema = {
  schema: {
    body: {
      type: "object",
      required: ["env_id"],
      properties: { env_id: { type: "string", format: "uuid" } },
      additionalProperties: false,
    },
  },
};

// PUT /portal/api-tokens/:id/permissions: whole-matrix replace.
//
// `permissions` is deliberately left open rather than spelled out as
// module-by-action properties: the vocabulary lives in
// src/utils/tokenPermissionCatalog.js, is fetched by both consoles from the
// catalog endpoint, and the controller normalises whatever arrives. Mirroring
// it here would be a third copy to keep in step.
export const SetPermissionsSchema = {
  schema: {
    params: ID_PARAM,
    body: {
      type: "object",
      required: ["permissions"],
      properties: {
        permissions: { type: "object", additionalProperties: true },
      },
    },
  },
};

// PUT /portal/api-tokens/:id/status: the Active switch in the list.
export const SetStatusSchema = {
  schema: {
    params: ID_PARAM,
    body: {
      type: "object",
      required: ["is_active"],
      properties: { is_active: { type: "boolean" } },
      additionalProperties: false,
    },
  },
};

// DELETE /portal/api-tokens/:id
export const IdParamSchema = {
  schema: { params: ID_PARAM },
};
