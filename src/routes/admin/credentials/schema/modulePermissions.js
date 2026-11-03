// Params shared by both routes below. Same shape as the token module's
// IdParamSchema: the id is a uuid, validated before any handler runs.
const IdParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

export const GetModulePermissionsSchema = {
  schema: { params: IdParam },
};

/**
 * PUT /admin/credentials/:id/module-permissions: whole-matrix replace.
 *
 * `permissions` is deliberately left open rather than spelled out as
 * module-by-action properties, for the same reason the token route leaves it
 * open: the vocabulary lives in src/utils/tokenPermissionCatalog.js, is fetched
 * by the console from the catalog endpoint, and the controller normalises
 * whatever arrives (discarding unknown modules and forcing off actions a module
 * cannot express). Mirroring it here would be a third copy to keep in step, and
 * JSON Schema cannot say "these keys are whatever the catalogue currently
 * declares".
 */
export const SetModulePermissionsSchema = {
  schema: {
    params: IdParam,
    body: {
      type: "object",
      required: ["permissions"],
      properties: {
        permissions: { type: "object", additionalProperties: true },
      },
    },
  },
};
