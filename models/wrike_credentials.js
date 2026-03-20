"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class WrikeCredentials extends Model {
    static associate(models) {
      WrikeCredentials.hasMany(models.UserTokens, {
        as: "tokens",
        foreignKey: "env_id",
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      });
    }
  }

  WrikeCredentials.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      environment_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Unique environment name",
      },
      api_client_id: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Encrypted API Client ID",
      },
      api_client_secret: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Encrypted API Client Secret",
      },
      automation_client_id: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Encrypted Automation Client ID",
      },
      automation_client_secret: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Encrypted Automation Client Secret",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
      deleted_at: {
        type: DataTypes.DATE,
      },
      created_by: {
        type: DataTypes.UUID,
      },
      updated_by: {
        type: DataTypes.UUID,
      },
    },
    {
      sequelize,
      modelName: "WrikeCredentials",
      tableName: "wrike_credentials",
      underscored: true,
      createdAt: false,
      updatedAt: false,
      paranoid: true,
      deletedAt: "deleted_at",
    },
  );

  return WrikeCredentials;
};
