"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class ApiActivityLogs extends Model {
    static associate(models) {
      ApiActivityLogs.belongsTo(models.WrikeCredentials, {
        as: "environment",
        foreignKey: "env_id",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }
  }

  ApiActivityLogs.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      env_id: { type: DataTypes.UUID, allowNull: true },
      environment_name: { type: DataTypes.STRING(255), allowNull: true }, // Which token made the call. Null for rows written before this column
      // existed, for the public token-service routes, and for any call that
      // fails before a token is identified. See
      // migrations/20260917000001-add-token-id-to-api-activity-logs.js.
      token_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "user_tokens.id of the token that made the call",
      },
      surface: { type: DataTypes.ENUM("rest", "mcp"), allowNull: false },
      actor_email: { type: DataTypes.STRING(320), allowNull: true },
      action: { type: DataTypes.STRING(16), allowNull: true },
      resource: { type: DataTypes.STRING(255), allowNull: false },
      method: { type: DataTypes.STRING(8), allowNull: true },
      allowed: { type: DataTypes.BOOLEAN, allowNull: false },
      code: { type: DataTypes.STRING(64), allowNull: true },
      status_code: { type: DataTypes.INTEGER, allowNull: true },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      category: { type: DataTypes.STRING(32), allowNull: true },
      request_payload: { type: DataTypes.JSON, allowNull: true },
      response_payload: { type: DataTypes.JSON, allowNull: true },
      created_at: { type: DataTypes.DATE },
    },
    {
      sequelize,
      modelName: "ApiActivityLogs",
      tableName: "api_activity_logs",
      underscored: true,
      createdAt: "created_at",
      updatedAt: false,
    },
  );

  return ApiActivityLogs;
};
