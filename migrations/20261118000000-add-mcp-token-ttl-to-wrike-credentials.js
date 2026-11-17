"use strict";

/**
 * Per-environment MCP token lifetimes. Both are optional overrides of the
 * global values in app_settings (mcp_access_token_ttl_seconds /
 * mcp_refresh_token_ttl_seconds): null means "use the global value".
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      "wrike_credentials",
      "mcp_access_token_ttl_seconds",
      { type: Sequelize.INTEGER, allowNull: true },
    );
    await queryInterface.addColumn(
      "wrike_credentials",
      "mcp_refresh_token_ttl_seconds",
      { type: Sequelize.INTEGER, allowNull: true },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn(
      "wrike_credentials",
      "mcp_refresh_token_ttl_seconds",
    );
    await queryInterface.removeColumn(
      "wrike_credentials",
      "mcp_access_token_ttl_seconds",
    );
  },
};
