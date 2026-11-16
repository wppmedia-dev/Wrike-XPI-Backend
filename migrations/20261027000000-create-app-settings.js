"use strict";

/**
 * A small key/value store the admin portal edits. First user is the MCP access
 * and refresh token lifetimes (src/utils/mcpTokenSettings.js).
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("app_settings", {
      key: { type: Sequelize.STRING(100), primaryKey: true, allowNull: false },
      value: { type: Sequelize.JSONB, allowNull: false },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "admin_users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("app_settings");
  },
};
