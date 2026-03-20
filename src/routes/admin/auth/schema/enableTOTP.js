export const EnableTOTPSchema = {
  schema: {
    body: {
      type: "object",
      required: ["totp_secret", "totp_code"],
      properties: {
        totp_secret: { type: "string" },
        totp_code: { type: "string" },
      },
    },
  },
};
