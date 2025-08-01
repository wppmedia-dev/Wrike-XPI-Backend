export const UpdateChannelSchema = {
  schema: {
    params: {
      type: "object",
      required: ["channelId"],
      properties: {
        channelId: { type: "string" },
      },
    },
    body: {
      type: "object",
      required: [],
      properties: {},
    },
  },
};
