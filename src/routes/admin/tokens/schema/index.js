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
