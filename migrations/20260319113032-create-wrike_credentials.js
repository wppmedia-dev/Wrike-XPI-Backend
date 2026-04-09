"use strict";
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create the table
    await queryInterface.createTable("wrike_credentials", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      environment_name: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: "Unique environment name",
      },
      client_id: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Encrypted Client ID",
      },
      client_secret: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Encrypted Client Secret",
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("now"),
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: { schema: "public", tableName: "admin_users" },
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: { schema: "public", tableName: "admin_users" },
          key: "id",
        },
        onDelete: "SET NULL",
        onUpdate: "CASCADE",
      },
    });

    // Create unique index on environment_name excluding soft deleted records
    // This allows reusing names after soft delete
    await queryInterface.addIndex("wrike_credentials", {
      fields: ["environment_name"],
      where: { deleted_at: null },
      unique: true,
      name: "unique_environment_name_active",
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("wrike_credentials");
  },
};
