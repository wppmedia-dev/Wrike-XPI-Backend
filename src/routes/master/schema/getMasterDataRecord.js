export const GetMasterDataRecordSchema = {
  schema: {
    params: {
      type: "object",
      required: ["masterSlug"],
      properties: {
        masterSlug: { type: "string" },
        recordId: { type: "string" },
      },
    },
  },
};
