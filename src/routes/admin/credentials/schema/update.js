export const UpdateSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
    body: {
      type: "object",
      required: ["environment_name"],
      properties: {
        environment_name: { type: "string" },
        client_id: { type: "string" },
        client_secret: { type: "string" },
      },
    },
  },
};
