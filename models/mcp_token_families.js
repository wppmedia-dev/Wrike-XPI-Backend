"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class McpTokenFamilies extends Model {
    static associate(models) {
      McpTokenFamilies.belongsTo(models.UserTokens, {
        as: "token",
        foreignKey: "token_id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      McpTokenFamilies.hasMany(models.McpRefreshTokens, {
        as: "refreshTokens",
        foreignKey: "family_id",
      });
    }
  }

  McpTokenFamilies.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      token_id: { type: DataTypes.UUID, allowNull: false },
      // client_id (which registered OAuth client a sign-in came from) and
      // last_used_at (last time it reached /mcp) are deliberately NOT declared
      // here. Sequelize names every declared column in its own INSERT/SELECT,
      // so declaring them would make sign-in and refresh fail on any database
      // whose migrations have not caught up. They only feed the admin console,
      // and are read and written with plain SQL (src/controllers/mcpTokens.js,
      // src/controllers/oauthClients.js) that fails in isolation.
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      last_rotated_at: { type: DataTypes.DATE, allowNull: true },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      revoked_reason: { type: DataTypes.STRING(100), allowNull: true },
    },
    {
      sequelize,
      modelName: "McpTokenFamilies",
      tableName: "mcp_token_families",
      underscored: true,
      createdAt: false,
      updatedAt: false,
    },
  );

  return McpTokenFamilies;
};
