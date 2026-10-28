"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class McpRefreshTokens extends Model {
    static associate(models) {
      McpRefreshTokens.belongsTo(models.McpTokenFamilies, {
        as: "family",
        foreignKey: "family_id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
    }
  }

  McpRefreshTokens.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      family_id: { type: DataTypes.UUID, allowNull: false },
      token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        comment: "SHA-256 of the refresh token; the token itself is never stored",
      },
      wrapped_dek: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "DEK wrapped under a key derived from the refresh token",
      },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: "McpRefreshTokens",
      tableName: "mcp_refresh_tokens",
      underscored: true,
      createdAt: false,
      updatedAt: false,
    },
  );

  return McpRefreshTokens;
};
