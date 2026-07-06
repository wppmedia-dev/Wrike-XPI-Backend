export const GetAllCampaignTasksSchema = {
  schema: {
    query: {
      type: "object",
      required: [],
      properties: {
        filter: { type: "string" },
        pageSize: { type: "integer" },
        nextPageToken: { type: "string" },
      },
    },
    params: {
      type: "object",
      required: ["campaignId"],
      properties: {
        campaignId: { type: "string" },
      },
    },
  },
};
