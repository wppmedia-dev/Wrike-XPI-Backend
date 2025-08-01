export const GetAllChannelsSchema = {
  schema: {
    query: {
      type: "object",
      required: ["filter"],
      properties: {
        filter: { type: "string" },
        pageSize: { type: "integer" },
      },
    },
  },
};
