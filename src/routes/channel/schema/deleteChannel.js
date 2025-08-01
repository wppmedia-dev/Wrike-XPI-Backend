export const DeleteChannelSchema = {
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
