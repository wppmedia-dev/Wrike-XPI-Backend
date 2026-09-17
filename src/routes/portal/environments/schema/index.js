import { SaveSchema } from "../../../admin/credentials/schema/save";

/**
 * Validation for the portal's own environment CRUD
 * (/api/v1/portal/environments).
 *
 * These were the largest hole of the missing-schema kind: a portal user with
 * environments:create or :update could post any shape at all, and the only
 * thing standing between that and the database was the handler remembering to
 * check each field. The handlers do check (blank name, blank client id, blank
 * secret, a page of "is required"), but a schema refuses a malformed request
 * before any of it runs, and refuses the fields nobody asked for:
 * `additionalProperties: false` is what turns "unknown key" from silently
 * ignored into a 400.
 *
 * The field list itself is the admin console's (SaveSchema), because it is the
 * same record: one environment, whichever console created it. Derived rather
 * than copied, so a field added there cannot go missing here.
 */

/** The two booleans the portal's own handlers apply on top of the saved record. */
const ENVIRONMENT_FIELDS = {
  ...SaveSchema.schema.body.properties,
  is_active: { type: "boolean" },
};

const ID_PARAM = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

/** POST /portal/environments — the whole record, as the portal's form posts it. */
export const CreateEnvironmentSchema = {
  schema: {
    body: {
      type: "object",
      required: SaveSchema.schema.body.required,
      properties: ENVIRONMENT_FIELDS,
      additionalProperties: false,
    },
  },
};

/**
 * PUT /portal/environments/:id — partial, deliberately.
 *
 * The handler applies whichever fields are present and rejects only an empty
 * body, so requiring the full record here would refuse updates that are
 * legitimate today (changing one datahub id, flipping is_active). What it can
 * insist on is that every field present is the right type, that at least one
 * is present, and that nothing else is sent.
 */
export const UpdateEnvironmentSchema = {
  schema: {
    params: ID_PARAM,
    body: {
      type: "object",
      minProperties: 1,
      properties: ENVIRONMENT_FIELDS,
      additionalProperties: false,
    },
  },
};

/** DELETE /portal/environments/:id */
export const IdParamSchema = { schema: { params: ID_PARAM } };
