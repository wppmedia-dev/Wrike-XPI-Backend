"use strict";

/**
 * Per-environment Wrike API host (e.g. https://app-us.wrike.com).
 *
 * Null means "use the deployment default", i.e. the WRIKE_ENDPOINT and
 * WRIKE_DATAHUB_ENDPOINT env vars (app-eu.wrike.com). The REST and Datahub
 * base URLs are both derived from this one host — see
 * src/utils/wrikeEndpoint.js.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("wrike_credentials", "wrike_api_host", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("wrike_credentials", "wrike_api_host");
  },
};
