export const UpdateCampaignSchema = {
  schema: {
    params: {
      type: "object",
      required: ["campaignId"],
      properties: {
        campaignId: { type: "string" },
      },
    },
    body: {
      type: "object",
      required: [],
      properties: {},
    },
  },
};
