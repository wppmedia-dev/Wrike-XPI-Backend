export const GetChannelSchema = {
  schema: {
    params: {
      type: "object",
      required: ["channelId"],
      properties: {
        channelId: { type: "string" },
      },
    },
  },
};
