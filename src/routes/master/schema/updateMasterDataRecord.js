export const UpdateMasterDataRecordSchema = {
  schema: {
    params: {
      type: "object",
      required: ["masterSlug", "recordId"],
      properties: {
        masterSlug: { type: "string" },
        recordId: { type: "string" },
      },
    },
  },
};
