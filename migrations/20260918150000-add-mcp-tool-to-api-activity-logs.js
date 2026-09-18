"use strict";

/**
 * The MCP tool an agent called, on the row that request already writes.
 *
 * MCP logs one row per HTTP request (src/plugins/mcp.js), which until now said
 * only that a request arrived: the tool name was visible nowhere, so "what is
 * this agent actually calling?" could not be answered from the console. The
 * permission gate wraps every registered tool
 * (src/mcp/index.js installPermissionGate), so the name and the decision are
 * both known at the moment of the call and are written back onto the row.
 *
 * A string rather than a foreign key or an enum: these are tool names from two
 * sources — our sixteen native tools and whatever `wrike_*` tools the proxied
 * Wrike server happens to expose that day — so there is no table to point at,
 * and adding a tool must never need a migration. Multiple calls in one request
 * are joined with ", " and capped at the column width, which is why it is a
 * summary and not a list.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("api_activity_logs", "mcp_tool", {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: "MCP tool(s) called by this request, comma-separated, in order",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("api_activity_logs", "mcp_tool");
  },
};
