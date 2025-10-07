"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("user_credentials", {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      user_token_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "user_tokens",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      username: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      salt: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      // Audit columns
      created_at: {
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
        references: {
          model: { schema: "auth", tableName: "users" },
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      updated_by: {
        type: Sequelize.UUID,
        references: {
          model: { schema: "auth", tableName: "users" },
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      deleted_by: {
        type: Sequelize.UUID,
        references: {
          model: { schema: "auth", tableName: "users" },
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
    });

    // Add indexes
    await queryInterface.addIndex("user_credentials", ["user_token_id"]);
    await queryInterface.addIndex("user_credentials", ["username"]);
    await queryInterface.addIndex("user_credentials", ["created_by"]);
    await queryInterface.addIndex("user_credentials", ["updated_by"]);
    await queryInterface.addIndex("user_credentials", ["deleted_by"]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("user_credentials");
  },
};
