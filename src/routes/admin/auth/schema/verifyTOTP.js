export const VerifyTOTPSchema = {
  schema: {
    body: {
      type: "object",
      required: ["totp_token", "totp_code"],
      properties: {
        totp_token: { type: "string" },
        totp_code: { type: "string" },
      },
    },
  },
};
