"use strict";

/**
 * Module-level permissions for API tokens: one row per (token, module), each
 * carrying its own Read/Create/Update/Delete grant.
 *
 * The rows are the *exception*, not the rule. A token with no rows here is
 * unrestricted — that is what keeps every token issued before this table
 * existed working, and what makes the first save from the admin console the
 * moment a token becomes governed. So "no row for this module" deliberately
 * does not mean denied on its own; src/controllers/tokenPermissions.js
 * decides by asking whether the token has any rows at all.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("token_permissions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      token_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "user_tokens", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // Validated against the module list in
      // src/utils/tokenPermissionCatalog.js in the controller, rather than a
      // DB enum — adding a module is then a code change, not a migration.
      module: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      can_read: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      can_create: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      can_update: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      can_delete: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("now"),
        allowNull: false,
      },
      updated_at: { type: Sequelize.DATE, allowNull: true },
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

    // The whole matrix for one token is read in a single query on every
    // request that token authenticates, and again whenever the permissions
    // popup is opened.
    await queryInterface.addIndex("token_permissions", ["token_id"], {
      name: "token_permissions_token_idx",
    });

    await queryInterface.addIndex("token_permissions", ["token_id", "module"], {
      unique: true,
      name: "token_permissions_token_module_unique_idx",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "token_permissions",
      "token_permissions_token_module_unique_idx",
    );
    await queryInterface.removeIndex(
      "token_permissions",
      "token_permissions_token_idx",
    );
    await queryInterface.dropTable("token_permissions");
  },
};
