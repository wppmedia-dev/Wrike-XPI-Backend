export const WrikeTokenExchangeSchema = {
  schema: {
    query: {
      type: "object",
      required: ["code"],
      properties: {
        code: { type: "string" },
        state: { type: "string" },
      },
    },
  },
};
