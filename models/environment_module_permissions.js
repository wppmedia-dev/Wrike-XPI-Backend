"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class EnvironmentModulePermissions extends Model {
    static associate(models) {
      EnvironmentModulePermissions.belongsTo(models.WrikeCredentials, {
        as: "environment",
        foreignKey: "env_id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      EnvironmentModulePermissions.belongsTo(models.AdminUsers, {
        as: "creator",
        foreignKey: "created_by",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
      EnvironmentModulePermissions.belongsTo(models.AdminUsers, {
        as: "updater",
        foreignKey: "updated_by",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }
  }

  EnvironmentModulePermissions.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      env_id: { type: DataTypes.UUID, allowNull: false },
      module: {
        type: DataTypes.STRING(64),
        allowNull: false,
        comment: "Module key from src/utils/tokenPermissionCatalog.js",
      },
      can_read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      can_create: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      can_update: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      can_delete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "EnvironmentModulePermissions",
      tableName: "environment_module_permissions",
      underscored: true,
      // Written by the hooks below instead, so the actor behind a save lands on
      // updated_by: `profile_id` is how both permission controllers pass the
      // admin who saved. Same shape as models/token_permissions.js, so a matrix
      // save reads the same on either layer.
      createdAt: false,
      updatedAt: false,
    },
  );

  EnvironmentModulePermissions.beforeCreate((data, options) => {
    data.created_at = new Date();
    data.created_by = options?.profile_id || null;
  });

  EnvironmentModulePermissions.beforeUpdate((data, options) => {
    data.updated_at = new Date();
    data.updated_by = options?.profile_id || null;
  });

  return EnvironmentModulePermissions;
};
