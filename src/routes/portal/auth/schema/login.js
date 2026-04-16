export const LoginSchema = {
  schema: {
    body: {
      type: "object",
      required: ["username", "password"],
      properties: {
        username: { type: "string", minLength: 1, maxLength: 100 },
        password: { type: "string", minLength: 1 },
      },
      additionalProperties: false,
    },
  },
};
