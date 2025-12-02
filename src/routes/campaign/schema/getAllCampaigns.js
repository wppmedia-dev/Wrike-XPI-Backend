export const GetAllCampaignsSchema = {
  schema: {
    query: {
      type: "object",
      required: [],
      properties: {
        $skiptoken: { type: "string" },
        $top: { type: "integer" },
      },
    },
  },
};
