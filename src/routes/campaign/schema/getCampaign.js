export const GetCampaignSchema = {
  schema: {
    params: {
      type: "object",
      required: ["campaignId"],
      properties: {
        campaignId: { type: "string" },
      },
    },
  },
};
