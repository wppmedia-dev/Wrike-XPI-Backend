"use strict";

/**
 * The reference id a caller was shown when something failed, so the row that
 * explains the failure can be found from the message they are holding.
 *
 * Nullable, and null for most rows: a reference is only created when a request
 * produces an error response (src/plugins/errorReference.js for the HTTP
 * surfaces, src/mcp/index.js's gate for a refused MCP tool call). A row for a
 * successful call has nothing to look up, and writing one anyway would make
 * every row look reportable.
 *
 * Indexed because the whole point is a lookup by it.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("api_activity_logs", "reference_id", {
      type: Sequelize.STRING(32),
      allowNull: true,
      comment:
        "Reference shown to the caller with an error response, or null when the call succeeded",
    });

    await queryInterface.addIndex("api_activity_logs", ["reference_id"], {
      name: "api_activity_logs_reference_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "api_activity_logs",
      "api_activity_logs_reference_idx",
    );
    await queryInterface.removeColumn("api_activity_logs", "reference_id");
  },
};
