"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class AdminUsers extends Model {
    static associate(models) {}
  }

  AdminUsers.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      username: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      totp_secret: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Base32 encoded TOTP secret",
      },
      totp_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      last_login_at: {
        type: DataTypes.DATE,
        allowNull: true,
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
    },
    {
      sequelize,
      modelName: "AdminUsers",
      tableName: "admin_users",
      underscored: true,
      createdAt: false,
      updatedAt: false,
      paranoid: true,
      deletedAt: "deleted_at",
    },
  );

  return AdminUsers;
};
