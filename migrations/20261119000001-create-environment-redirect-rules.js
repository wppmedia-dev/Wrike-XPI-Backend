"use strict";

/**
 * Per-environment allow list of the places a sign-in may hand the browser back
 * to (the `redirectUri` that /get-redirect-url and the login page carry, and
 * that the token callback finally redirects to with the authorization code).
 *
 * Until now that address was taken from the query string unchecked, so a link
 * built by anyone could send the OAuth code to a server of their choosing. A
 * redirectUri is now honoured only when it matches an enabled entry here for the
 * environment the sign-in is for. No entry, no redirect.
 *
 * `value` is an origin (https://app.example.com) or an origin plus a path
 * prefix (https://app.example.com/auth/done). Matching rules live in
 * src/utils/redirectAllowlist.js.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("environment_redirect_rules", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      env_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "wrike_credentials", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      value: { type: Sequelize.STRING(500), allowNull: false },
      label: { type: Sequelize.STRING(255), allowNull: true },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("now"),
        allowNull: false,
      },
      updated_at: { type: Sequelize.DATE, allowNull: true },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "admin_users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "admin_users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
    });

    await queryInterface.addIndex(
      "environment_redirect_rules",
      ["env_id", "value"],
      {
        unique: true,
        name: "environment_redirect_rules_env_value_unique_idx",
        where: { deleted_at: null },
      },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "environment_redirect_rules",
      "environment_redirect_rules_env_value_unique_idx",
    );
    await queryInterface.dropTable("environment_redirect_rules");
  },
};
