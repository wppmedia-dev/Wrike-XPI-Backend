"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class AdminSessions extends Model {
    static associate(models) {
      AdminSessions.belongsTo(models.AdminUsers, {
        as: "admin",
        foreignKey: "admin_id",
        onDelete: "CASCADE",
      });
    }
  }

  AdminSessions.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      admin_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      session_token: {
        type: DataTypes.STRING(512),
        allowNull: false,
        unique: true,
      },
      totp_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: "Whether TOTP has been verified for this session",
      },
      ip_address: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      modelName: "AdminSessions",
      tableName: "admin_sessions",
      underscored: true,
      createdAt: false,
      updatedAt: false,
      timestamps: false,
    },
  );

  return AdminSessions;
};
