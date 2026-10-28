"use strict";

/**
 * The rotating refresh tokens of the MCP OAuth flow. Only the SHA-256 of the
 * token is stored, never the token. The DEK that decrypts the Wrike credential
 * is stored wrapped under a key derived from the refresh token itself, so a
 * database leak alone cannot decrypt anything.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("mcp_refresh_tokens", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      family_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "mcp_token_families", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      wrapped_dek: { type: Sequelize.TEXT, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
    await queryInterface.addIndex("mcp_refresh_tokens", ["family_id"]);
    await queryInterface.addIndex("mcp_refresh_tokens", ["expires_at"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("mcp_refresh_tokens");
  },
};
