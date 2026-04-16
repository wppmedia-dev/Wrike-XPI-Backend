export const ChangePasswordSchema = {
  schema: {
    body: {
      type: "object",
      required: ["current_password", "new_password"],
      properties: {
        current_password: { type: "string", minLength: 1 },
        new_password: { type: "string", minLength: 8 },
      },
      additionalProperties: false,
    },
  },
};
