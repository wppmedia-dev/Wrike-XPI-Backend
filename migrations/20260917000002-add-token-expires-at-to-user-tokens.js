"use strict";

/**
 * When the token issued for each row stops being accepted.
 *
 * The JWE a caller holds carries its expiry in its own payload, but nothing
 * server-side recorded it, so "when does this integration break?" had no
 * answer, and the admin console could only show when the token was created.
 * WrikeTokenExchange now writes this on every mint, one row per token, and the
 * API Tokens table reads it.
 *
 * Nullable: rows written before this column existed get a best-effort value
 * below, and any future insert path that has no mint to point at would leave it
 * null rather than guess.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("user_tokens", "token_expires_at", {
      type: Sequelize.DATE,
      allowNull: true,
      comment: "When the signed token issued for this row stops being accepted",
    });

    // Best effort for rows that predate the column. created_at is the closest
    // thing to an issue date that exists for them, and 180 days is
    // TOKEN_TTL_DAYS from src/utils/tokenTtl.js, spelled out here because a
    // migration has to mean the same thing when it is re-read later, whatever
    // that constant says by then.
    await queryInterface.sequelize.query(
      "UPDATE user_tokens SET token_expires_at = created_at + INTERVAL '180 days' WHERE token_expires_at IS NULL AND created_at IS NOT NULL",
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("user_tokens", "token_expires_at");
  },
};
