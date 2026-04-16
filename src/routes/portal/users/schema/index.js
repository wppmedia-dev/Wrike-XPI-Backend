export const CreateUserSchema = {
  schema: {
    body: {
      type: "object",
      required: ["username", "password", "role"],
      properties: {
        username: { type: "string", minLength: 3, maxLength: 100 },
        password: { type: "string", minLength: 8 },
        role: { type: "string", enum: ["admin", "user"] },
        full_name: { type: "string", maxLength: 255 },
        email: { type: "string", format: "email" },
      },
      additionalProperties: false,
    },
  },
};

export const ResetPasswordSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", format: "uuid" },
      },
    },
    body: {
      type: "object",
      required: ["new_password"],
      properties: {
        new_password: { type: "string", minLength: 8 },
      },
      additionalProperties: false,
    },
  },
};

export const ToggleUserSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", format: "uuid" },
      },
    },
    body: {
      type: "object",
      required: ["is_active"],
      properties: {
        is_active: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
};

export const AssignEnvSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", format: "uuid" },
      },
    },
    body: {
      type: "object",
      required: ["env_id"],
      properties: {
        env_id: { type: "string", format: "uuid" },
      },
      additionalProperties: false,
    },
  },
};

export const RevokeEnvSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", format: "uuid" },
      },
    },
    querystring: {
      type: "object",
      required: ["env_id"],
      properties: {
        env_id: { type: "string", format: "uuid" },
      },
    },
  },
};
