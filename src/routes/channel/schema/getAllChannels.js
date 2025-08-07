export const GetAllChannelsSchema = {
  schema: {
    query: {
      type: "object",
      required: ["filter"],
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
