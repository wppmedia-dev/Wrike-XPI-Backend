export const GetMasterDataValueSchema = {
  schema: {
    params: {
      type: "object",
      required: ["masterSlug"],
      properties: {
        masterSlug: { type: "string" },
        shortcode: { type: "string" },
      },
    },
  },
};
