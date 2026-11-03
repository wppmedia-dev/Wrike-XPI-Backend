/**
 * Request validation for /api/v1/portal/environment-modules.
 *
 * No create or delete schema: an environment's ceiling is replaced wholesale
 * (update) and never created or removed from here — the environments
 * themselves are managed by the admin console.
 */

const ID_PARAM = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

// PUT /portal/environment-modules/:id/permissions: whole-matrix replace.
//
// `permissions` is deliberately left open rather than spelled out as
// module-by-action properties: the vocabulary lives in
// src/utils/tokenPermissionCatalog.js, is fetched by both consoles from a
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

export const IdParamSchema = { schema: { params: ID_PARAM } };
