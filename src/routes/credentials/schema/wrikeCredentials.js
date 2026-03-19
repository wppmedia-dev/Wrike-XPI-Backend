export const SaveWrikeCredentialsSchema = {
  body: {
    type: "object",
    required: ["credentialType", "clientId", "clientSecret"],
    properties: {
      credentialType: {
        type: "string",
        enum: ["API", "AUTOMATION"],
        description: "Type of credential - API or AUTOMATION",
      },
      clientId: {
        type: "string",
        description: "Wrike Client ID",
      },
      clientSecret: {
        type: "string",
        description: "Wrike Client Secret",
      },
      token: {
        type: "string",
        description: "Optional Wrike Token (for service accounts)",
      },
    },
  },
};
