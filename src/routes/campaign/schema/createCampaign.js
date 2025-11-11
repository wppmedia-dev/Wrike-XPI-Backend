export const CreateCampaignSchema = {
  schema: {
    body: {
      type: "object",
      required: ["type", "space", "entity", "variantId", "fields"],
      properties: {
        type: { type: "string" },
        space: { type: "string" },
        entity: { type: "string" },
        variantId: { type: "integer" },
        fields: { type: "object" },
      },
    },
  },
};
