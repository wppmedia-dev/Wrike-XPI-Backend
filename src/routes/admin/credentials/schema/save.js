export const SaveSchema = {
  schema: {
    body: {
      type: "object",
      required: ["environment_name"],
      properties: {
        environment_name: { type: "string" },
        api_client_id: { type: "string" },
        api_client_secret: { type: "string" },
        automation_client_id: { type: "string" },
        automation_client_secret: { type: "string" },
      },
    },
  },
};
