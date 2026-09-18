export const WrikeTokenExchangeSchema = {
  schema: {
    query: {
      type: "object",
      required: ["code"],
      properties: {
        code: { type: "string" },
        state: { type: "string" },
        // "calendar_sync" mints a token with no expiry for a calendar
        // integration; anything else (including absent) is a normal sign-in.
        // Declared because the token surface's schema strips what it does not
        // declare, and an undeclared purpose would never reach the mint.
        purpose: { type: "string" },
      },
    },
  },
};
