"use strict";
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create the table
    await queryInterface.createTable("user_tokens", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      account_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      encrypted_access_token: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      encrypted_refresh_token: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      wrapped_dek: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        defaultValue: false,
        type: Sequelize.BOOLEAN,
      },
      created_at: {
        defaultValue: Sequelize.fn("now"),
        type: Sequelize.DATE,
      },
      updated_at: {
        type: Sequelize.DATE,
      },
      deleted_at: {
        type: Sequelize.DATE,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
        references: {
          model: { schema: "auth", tableName: "users" },
          key: "id",
        },
      },
      updated_by: {
        type: Sequelize.UUID,
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
        references: {
          model: { schema: "auth", tableName: "users" },
          key: "id",
        },
      },
      deleted_by: {
        type: Sequelize.UUID,
        onDelete: "RESTRICT",
        onUpdate: "CASCADE",
        references: {
          model: { schema: "auth", tableName: "users" },
          key: "id",
        },
      },
    });
  },
  down: async (queryInterface, Sequelize) => {
    // Then drop the table
    await queryInterface.dropTable("user_tokens");
  },
};
