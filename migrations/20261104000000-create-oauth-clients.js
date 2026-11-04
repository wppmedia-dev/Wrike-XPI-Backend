"use strict";

/**
 * Dynamically registered OAuth clients (POST /oauth/register).
 *
 * The client_id handed to a client is still a signed JWT (so /authorize can
 * read the registered redirect_uris without a lookup), but it now carries a
 * `jti` equal to this table's id. That row is what makes a registration
 * visible to admins and revocable: /oauth/authorize and /oauth/token refuse a
 * client_id whose row has revoked_at set.
 *
 * Client ids minted before this table existed have no jti and therefore no
 * row; see OAUTH_ACCEPT_LEGACY_CLIENTS in src/routes/oauth/index.js.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("oauth_clients", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      client_name: { type: Sequelize.STRING(200), allowNull: true },
      redirect_uris: { type: Sequelize.JSONB, allowNull: false },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("now"),
        allowNull: false,
      },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      last_used_at: { type: Sequelize.DATE, allowNull: true },
      created_ip: { type: Sequelize.STRING(64), allowNull: true },
      user_agent: { type: Sequelize.STRING(512), allowNull: true },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      revoked_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "admin_users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
    });

    await queryInterface.addIndex("oauth_clients", ["created_at"], {
      name: "oauth_clients_created_at_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "oauth_clients",
      "oauth_clients_created_at_idx",
    );
    await queryInterface.dropTable("oauth_clients");
  },
};
