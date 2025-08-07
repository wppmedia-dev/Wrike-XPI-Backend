export const UpdateTaskSchema = {
  schema: {
    params: {
      type: "object",
      required: ["taskId"],
      properties: {
        taskId: { type: "string" },
      },
    },
    body: {
      type: "object",
      required: [],
      properties: {},
    },
  },
};
