"use strict";

/**
 * Per-environment switch for the native xtend_* MCP tools.
 *
 * On means the environment's MCP server offers the xtend_* family — but only
 * while the Datahub IDs those tools run against are filled in
 * (src/utils/xtendTools.js); on with an empty ID is still off.
 *
 * Defaults to true so every environment that exists today keeps the tools it
 * has now. The empty-ID rule is what switches off an environment that was
 * never given its IDs.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("wrike_credentials", "xtend_tools_enabled", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("wrike_credentials", "xtend_tools_enabled");
  },
};
