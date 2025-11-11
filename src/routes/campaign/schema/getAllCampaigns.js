export const GetAllCampaignsSchema = {
  schema: {
    query: {
      type: "object",
      required: [],
      properties: {
        filter: { type: "string" },
        pageSize: { type: "integer" },
      },
    },
  },
};
