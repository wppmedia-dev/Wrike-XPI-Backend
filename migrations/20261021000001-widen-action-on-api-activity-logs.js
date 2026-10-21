"use strict";

/**
 * `action` was created as VARCHAR(16), enough for the REST CRUD verbs (read |
 * create | update | delete). The MCP surface stores the JSON-RPC method names
 * there instead ("tools/call", "notifications/initialized", or several joined
 * by ", "), which overflow 16 characters and made the insert fail with
 * "value too long for type character varying(16)", so the row was lost.
 *
 * 255 matches the slice src/plugins/mcp.js already applies before writing.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("api_activity_logs", "action", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Longer values cannot survive the narrower column, so cut them first.
    await queryInterface.sequelize.query(
      'UPDATE "api_activity_logs" SET "action" = LEFT("action", 16) WHERE LENGTH("action") > 16;',
    );
    await queryInterface.changeColumn("api_activity_logs", "action", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
  },
};
