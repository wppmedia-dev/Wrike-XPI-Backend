export const CreateChannelSchema = {
  schema: {
    body: {
      type: "object",
      required: ["type", "space", "entity", "varientId", "fields"],
      properties: {
        type: { type: "string" },
        space: { type: "string" },
        entity: { type: "string" },
        varientId: { type: "integer" },
        fields: { type: "object" },
      },
    },
  },
};
