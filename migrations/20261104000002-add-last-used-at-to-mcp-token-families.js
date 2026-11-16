"use strict";

/**
 * When a sign-in's access token was last presented at /mcp. The refresh time
 * (last_rotated_at) only moves once per access-token lifetime, so on its own
 * it cannot tell the admin console whether a client is in use right now or
 * has been quiet (or disconnected on its own side) for a while. This is
 * written at most about once a minute per sign-in; see McpTokens.TouchFamily.
 *
 * Nullable: sign-ins that predate it fall back to their refresh/creation time.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("mcp_token_families", "last_used_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("mcp_token_families", "last_used_at");
  },
};
