export const DeleteMasterDataRecordSchema = {
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
