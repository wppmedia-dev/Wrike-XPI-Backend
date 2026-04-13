export const SaveSchema = {
  schema: {
    body: {
      type: "object",
      required: ["environment_name"],
      properties: {
        environment_name: { type: "string" },
        client_id: { type: "string" },
        client_secret: { type: "string" },
        account_id: { type: "string" },
      },
    },
  },
};
