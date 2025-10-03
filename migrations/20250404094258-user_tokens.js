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
      username: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      encrypted_access_token: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      encrypted_refresh_token: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      salt: {
        type: Sequelize.STRING(32),
        allowNull: true,
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

    // Add unique index for username
    await queryInterface.addIndex("user_tokens", ["username"], {
      unique: true,
      where: {
        is_active: true,
      },
      name: "user_tokens_username_unique_active_idx",
    });
  },
  down: async (queryInterface, Sequelize) => {
    // Remove index first
    await queryInterface.removeIndex(
      "user_tokens",
      "user_tokens_username_unique_active_idx"
    );
    // Then drop the table
    await queryInterface.dropTable("user_tokens");
  },
};
