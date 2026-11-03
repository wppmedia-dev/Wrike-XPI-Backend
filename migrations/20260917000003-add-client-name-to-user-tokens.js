"use strict";

/**
 * What a token was issued to.
 *
 * A user can now hold more than one token for the same account and environment
 * (each mint creates its own row, see
 * src/routes/tokens/handlers/wrikeTokenExchange.js), so two rows can look
 * identical in the console: same environment, same account, same creator.
 * This records what we know about the caller at mint time.
 *
 * Values are whatever the mint could establish: the client name a DCR
 * registration supplied (e.g. "Claude"), the generic "MCP client" when a
 * client_id verified but registered no name, or "Login page" for the web and
 * non-PKCE exchanges, which carry no client identity at all. Null for rows
 * written before the column existed.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("user_tokens", "client_name", {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: "What the token was issued to, as far as the mint could tell",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("user_tokens", "client_name");
  },
};
