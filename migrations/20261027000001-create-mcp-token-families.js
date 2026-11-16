"use strict";

/**
 * One row per MCP sign-in (one per authorization code exchanged). A family
 * points at the user_tokens row that holds the encrypted Wrike credential, and
 * is the unit of revocation: revoking it kills the access tokens and every
 * refresh token that descends from the sign-in.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("mcp_token_families", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      token_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "user_tokens", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      last_rotated_at: { type: Sequelize.DATE, allowNull: true },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      revoked_reason: { type: Sequelize.STRING(100), allowNull: true },
    });
    await queryInterface.addIndex("mcp_token_families", ["token_id"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("mcp_token_families");
  },
};
