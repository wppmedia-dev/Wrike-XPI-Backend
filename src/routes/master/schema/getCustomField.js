export const GetCustomFieldSchema = {
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
