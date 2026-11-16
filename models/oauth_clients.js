"use strict";

const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class OAuthClients extends Model {
    static associate(models) {
      OAuthClients.belongsTo(models.AdminUsers, {
        as: "revoker",
        foreignKey: "revoked_by",
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }
  }

  OAuthClients.init(
    {
      id: {
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        comment: "Also the jti of the signed client_id",
      },
      client_name: { type: DataTypes.STRING(200), allowNull: true },
      redirect_uris: { type: DataTypes.JSONB, allowNull: false },
      created_at: { type: DataTypes.DATE },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      last_used_at: { type: DataTypes.DATE, allowNull: true },
      created_ip: { type: DataTypes.STRING(64), allowNull: true },
      user_agent: { type: DataTypes.STRING(512), allowNull: true },
      revoked_at: { type: DataTypes.DATE, allowNull: true },
      revoked_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      sequelize,
      modelName: "OAuthClients",
      tableName: "oauth_clients",
      underscored: true,
      createdAt: false,
      updatedAt: false,
    },
  );

  OAuthClients.beforeCreate((data) => {
    data.created_at = new Date();
  });

  return OAuthClients;
};
