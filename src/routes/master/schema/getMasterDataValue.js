export const GetMasterDataValueSchema = {
  schema: {
    params: {
      type: "object",
      required: ["customfield"],
      properties: {
        customfield: { type: "string" },
      },
    },
  },
};
