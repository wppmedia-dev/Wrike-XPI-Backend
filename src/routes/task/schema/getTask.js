export const GetTaskSchema = {
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
