export const RegisterSchema = {
  schema: {
    body: {
      type: "object",
      required: ["username", "password"],
      properties: {
        username: { type: "string" },
        password: { type: "string" },
        setup_key: { type: "string" },
      },
    },
  },
};
