"use strict";

/**
 * Which token made the call.
 *
 * Until now a row could say which environment and which Wrike user called,
 * but not which of that environment's tokens — so "show me this token's
 * history" could only be answered by an approximation (environment + email),
 * which stops being true as soon as an account holds more than one token.
 * The admin console now links here from a token row, so the column is
 * indexed.
 *
 * Nullable on purpose. Rows written before this column existed have no token
 * to point at, and the public token-service routes (exchange, callback)
 * cannot always attribute a call: during a token exchange the token row is
 * being created by the very request being logged.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("api_activity_logs", "token_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "user_tokens", key: "id" },
      onUpdate: "CASCADE",
      // A token is normally soft-deleted (user_tokens.deleted_at), so this
      // only fires on a hard delete — at which point nulling the reference is
      // right: the history stays, minus a pointer to a row that is gone.
      onDelete: "SET NULL",
    });

    await queryInterface.addIndex("api_activity_logs", ["token_id"], {
      name: "api_activity_logs_token_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "api_activity_logs",
      "api_activity_logs_token_idx",
    );
    await queryInterface.removeColumn("api_activity_logs", "token_id");
  },
};
