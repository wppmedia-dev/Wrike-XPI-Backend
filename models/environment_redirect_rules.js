"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class EnvironmentRedirectRules extends Model {
    static associate(models) {
      EnvironmentRedirectRules.belongsTo(models.WrikeCredentials, {
        as: "environment",
        foreignKey: "env_id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
    }
  }

  EnvironmentRedirectRules.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      env_id: { type: DataTypes.UUID, allowNull: false },
      value: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment:
          "Normalised origin, optionally with a path prefix (src/utils/redirectAllowlist.js)",
      },
      label: { type: DataTypes.STRING(255), allowNull: true },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Admin on/off switch — a disabled entry never matches",
      },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
      deleted_at: { type: DataTypes.DATE },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "EnvironmentRedirectRules",
      tableName: "environment_redirect_rules",
      underscored: true,
      createdAt: false,
      updatedAt: false,
      paranoid: true,
      deletedAt: "deleted_at",
    },
  );

  EnvironmentRedirectRules.beforeCreate((data, options) => {
    data.created_at = new Date();
    data.created_by = options?.profile_id || null;
  });

  EnvironmentRedirectRules.beforeUpdate((data, options) => {
    data.updated_at = new Date();
    data.updated_by = options?.profile_id || null;
  });

  return EnvironmentRedirectRules;
};
