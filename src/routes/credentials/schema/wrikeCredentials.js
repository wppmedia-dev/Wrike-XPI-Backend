export const SaveWrikeCredentialsSchema = {
  body: {
    type: "object",
    required: ["environmentName", "apiClientId", "apiClientSecret"],
    properties: {
      environmentName: {
        type: "string",
        description: "Unique environment name (e.g. production, staging)",
      },
      apiClientId: {
        type: "string",
        description: "Wrike API Client ID",
      },
      apiClientSecret: {
        type: "string",
        description: "Wrike API Client Secret",
      },
      automationClientId: {
        type: "string",
        description: "Wrike Automation Client ID (optional)",
      },
      automationClientSecret: {
        type: "string",
        description: "Wrike Automation Client Secret (optional)",
      },
    },
  },
};
