export const AmoebaSchema = {
  schema: {
    params: {
      type: "object",
      required: ["moduleSlug"],
      properties: {
        moduleSlug: { type: "string" },
        serviceSlug: { type: "string" },
      },
    },
  },
};
