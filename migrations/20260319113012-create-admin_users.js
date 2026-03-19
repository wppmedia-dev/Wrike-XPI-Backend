"use strict";
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Admin users table
    await queryInterface.createTable("admin_users", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      username: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      totp_secret: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: "Base32 encoded TOTP secret",
      },
      totp_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      },
      last_login_at: {
        type: Sequelize.DATE,
        allowNull: true,
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
    });

    // Admin sessions table for tracking sessions and TOTP verification
    await queryInterface.createTable("admin_sessions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "admin_users",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      session_token: {
        type: Sequelize.STRING(512),
        allowNull: false,
        unique: true,
      },
      totp_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: "Whether TOTP has been verified for this session",
      },
      ip_address: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("now"),
        allowNull: false,
      },
    });

    // Create index on session token for faster lookups
    await queryInterface.addIndex("admin_sessions", {
      fields: ["session_token"],
      name: "idx_admin_sessions_token",
    });

    // Create index on admin_id
    await queryInterface.addIndex("admin_sessions", {
      fields: ["admin_id"],
      name: "idx_admin_sessions_admin_id",
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("admin_sessions");
    await queryInterface.dropTable("admin_users");
  },
};
