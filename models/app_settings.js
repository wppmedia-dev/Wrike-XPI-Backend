"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class AppSettings extends Model {
    static associate(models) {
      AppSettings.belongsTo(models.AdminUsers, {
        as: "updater",
        foreignKey: "updated_by",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }
  }

  AppSettings.init(
    {
      key: { primaryKey: true, type: DataTypes.STRING(100) },
      value: { type: DataTypes.JSONB, allowNull: false },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      modelName: "AppSettings",
      tableName: "app_settings",
      underscored: true,
      createdAt: false,
      updatedAt: false,
    },
  );

  return AppSettings;
};
