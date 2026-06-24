export const GetAllTasksSchema = {
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
      required: ["channelId"],
      properties: {
        channelId: { type: "string" },
      },
    },
  },
};
