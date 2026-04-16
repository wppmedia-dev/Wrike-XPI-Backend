"use strict";
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("wrike_credentials", "owner_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: "portal_users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("wrike_credentials", "owner_id");
  },
};
