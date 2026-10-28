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
