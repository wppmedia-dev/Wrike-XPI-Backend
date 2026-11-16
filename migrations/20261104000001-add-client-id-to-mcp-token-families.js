"use strict";

/**
 * Which registered OAuth client (oauth_clients.id, the jti of its client_id) a
 * sign-in came from. It lets the admin console show whether a client still has
 * a live connection, instead of only whether its registration exists.
 *
 * Nullable on purpose: sign-ins made before this column existed, and sign-ins
 * from a client_id that predates the client registry, have no client to point
 * at. They keep working exactly as before. There is deliberately no foreign
 * key: a purged client row must never take its sign-ins with it.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("mcp_token_families", "client_id", {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addIndex("mcp_token_families", ["client_id"], {
      name: "mcp_token_families_client_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "mcp_token_families",
      "mcp_token_families_client_idx",
    );
    await queryInterface.removeColumn("mcp_token_families", "client_id");
  },
};
