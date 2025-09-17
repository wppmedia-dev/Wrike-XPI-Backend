export const CreateMasterDataRecordSchema = {
  schema: {
    params: {
      type: "object",
      required: ["masterSlug"],
      properties: {
        masterSlug: { type: "string" },
      },
    },
  },
};
