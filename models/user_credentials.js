"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class UserCredentials extends Model {
    static associate(models) {
      UserCredentials.belongsTo(models.UserTokens, {
        foreignKey: "user_token_id",
        as: "userToken",
      });
      UserCredentials.belongsTo(models.Users, {
        as: "creator",
        foreignKey: "created_by",
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      });
      UserCredentials.belongsTo(models.Users, {
        as: "updater",
        foreignKey: "updated_by",
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      });
      UserCredentials.belongsTo(models.Users, {
        as: "deleter",
        foreignKey: "deleted_by",
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      });
    }
  }

  UserCredentials.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
      },
      user_token_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "user_tokens",
          key: "id",
        },
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      salt: {
        type: DataTypes.STRING,
        allowNull: false,
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
    },
    {
      sequelize,
      modelName: "UserCredentials",
      tableName: "user_credentials",
      underscored: true,
      createdAt: false,
      updatedAt: false,
      paranoid: true,
      deletedAt: "deleted_at",
    }
  );

  // Create Hook
  UserCredentials.beforeCreate((data, options) => {
    try {
      data.created_at = new Date();
      data.created_by = options?.profile_id;
    } catch (err) {
      console.log("Error while creating user credentials", err?.message || err);
    }
  });

  // Update Hook
  UserCredentials.beforeUpdate(async (data, options) => {
    try {
      data.updated_at = new Date();
      data.updated_by = options?.profile_id;
    } catch (err) {
      console.log("Error while updating user credentials", err?.message || err);
    }
  });

  // Delete Hook
  UserCredentials.beforeDestroy(async (data, options) => {
    try {
      data.deleted_at = new Date();
      data.deleted_by = options?.profile_id;
      data.is_active = false;
      await data.save({ profile_id: options.profile_id });
    } catch (err) {
      console.log("Error while deleting user credentials", err?.message || err);
    }
  });

  return UserCredentials;
};
