const UUID_PARAM = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string", format: "uuid" } },
};

// The shape of `value` (an https origin, optional path prefix) is enforced by
// normaliseRedirectRule in the controller, which is also what stores it, so the
// two cannot disagree. The schema only bounds the size.
const VALUE = { type: "string", minLength: 1, maxLength: 500 };

export const CreateRuleSchema = {
  schema: {
    body: {
      type: "object",
      required: ["env_id", "value"],
      properties: {
        env_id: { type: "string", format: "uuid" },
        value: VALUE,
        label: { type: "string", maxLength: 255, nullable: true },
        is_enabled: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
};

export const UpdateRuleSchema = {
  schema: {
    params: UUID_PARAM,
    body: {
      type: "object",
      minProperties: 1,
      properties: {
        value: VALUE,
        label: { type: "string", maxLength: 255, nullable: true },
        is_enabled: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
};

export const IdParamSchema = { schema: { params: UUID_PARAM } };

export const EnvQuerySchema = {
  schema: {
    querystring: {
      type: "object",
      required: ["env_id"],
      properties: {
        env_id: { type: "string", format: "uuid" },
        // Search, the enabled filter and paging are the database's job
        // (RedirectRules.ListRulesPage), so a list of any length stays one page
        // of rows on the wire. Bounds match the controller's clamps.
        search: { type: "string", maxLength: 200 },
        status: { type: "string", enum: ["all", "enabled", "disabled"] },
        page: { type: "integer", minimum: 1 },
        page_size: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
  },
};

/** The simulator: would this redirect URL be honoured for this environment? */
export const CheckSchema = {
  schema: {
    body: {
      type: "object",
      required: ["env_id", "redirect_uri"],
      properties: {
        env_id: { type: "string", format: "uuid" },
        redirect_uri: { type: "string", minLength: 1, maxLength: 2000 },
      },
      additionalProperties: false,
    },
  },
};
