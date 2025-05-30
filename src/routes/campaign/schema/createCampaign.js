export const CreateCampaignSchema = {
  schema: {
    body: {
      type: "object",
      required: ["fields"],
      properties: {
        fields: { type: "array" },
      },
    },
  },
};
