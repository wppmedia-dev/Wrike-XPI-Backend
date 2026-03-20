export const VerifyTOTPSchema = {
  schema: {
    body: {
      type: "object",
      required: ["session_token", "totp_code"],
      properties: {
        session_token: { type: "string" },
        totp_code: { type: "string" },
      },
    },
  },
};
