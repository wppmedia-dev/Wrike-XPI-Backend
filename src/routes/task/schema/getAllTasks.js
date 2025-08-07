export const GetAllTasksSchema = {
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
      required: ["channelId"],
      properties: {
        channelId: { type: "string" },
      },
    },
  },
};
