"use strict";

/**
 * Module-level permissions for ENVIRONMENTS: one row per (environment, module),
 * each carrying its own Read/Create/Update/Delete grant.
 *
 * This is the layer ABOVE the per-token matrix (token_permissions). A token's
 * matrix says what that one token may do; these rows say what anything in this
 * environment may do at all, so a token in a restricted environment cannot
 * reach further than the environment allows however its own grid is ticked
 * (src/middlewares/modulePermissions.js applies both, environment first).
 *
 * Same exception-not-rule shape as token_permissions, deliberately: an
 * environment with no rows here is unrestricted, which is what keeps every
 * existing environment, and every token already calling it, working the moment
 * this deploys. Restricting an environment is an explicit act, and its
 * src/controllers counterpart decides by asking whether the environment has
 * any rows at all.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("environment_module_permissions", {
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
      // Validated against the module list in
      // src/utils/tokenPermissionCatalog.js in the controller, rather than a
      // DB enum, so adding a module is a code change, not a migration. One
      // vocabulary for both layers: a module an admin cannot switch off for a
      // token is not a module they should be able to switch off for an
      // environment either.
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

    // The whole matrix for one environment is read in a single query on every
    // request into it, and again whenever the permissions popup is opened.
    await queryInterface.addIndex(
      "environment_module_permissions",
      ["env_id"],
      {
        name: "environment_module_permissions_env_idx",
      },
    );

    await queryInterface.addIndex(
      "environment_module_permissions",
      ["env_id", "module"],
      {
        unique: true,
        name: "environment_module_permissions_env_module_unique_idx",
      },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      "environment_module_permissions",
      "environment_module_permissions_env_module_unique_idx",
    );
    await queryInterface.removeIndex(
      "environment_module_permissions",
      "environment_module_permissions_env_idx",
    );
    await queryInterface.dropTable("environment_module_permissions");
  },
};
