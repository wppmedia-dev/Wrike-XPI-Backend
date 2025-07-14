export const DeleteCampaignSchema = {
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
