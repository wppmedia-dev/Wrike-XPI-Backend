"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class TokenPermissions extends Model {
    static associate(models) {
      TokenPermissions.belongsTo(models.UserTokens, {
        as: "token",
        foreignKey: "token_id",
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      });
      TokenPermissions.belongsTo(models.AdminUsers, {
        as: "creator",
        foreignKey: "created_by",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
      TokenPermissions.belongsTo(models.AdminUsers, {
        as: "updater",
        foreignKey: "updated_by",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }
  }

  TokenPermissions.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      token_id: { type: DataTypes.UUID, allowNull: false },
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
      modelName: "TokenPermissions",
      tableName: "token_permissions",
      underscored: true,
      createdAt: false,
      updatedAt: false,
    },
  );

  TokenPermissions.beforeCreate((data, options) => {
    data.created_at = new Date();
    data.created_by = options?.profile_id || null;
  });

  TokenPermissions.beforeUpdate((data, options) => {
    data.updated_at = new Date();
    data.updated_by = options?.profile_id || null;
  });

  return TokenPermissions;
};
