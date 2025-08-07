export const DeleteTaskSchema = {
  schema: {
    params: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string" },
      },
    },
  },
};
