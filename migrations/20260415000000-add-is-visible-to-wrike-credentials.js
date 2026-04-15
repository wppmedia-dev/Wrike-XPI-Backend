"use strict";
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add is_visible column to wrike_credentials table
    await queryInterface.addColumn("wrike_credentials", "is_visible", {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: "Flag to control visibility of environment in UI dropdowns",
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove is_visible column if migration is rolled back
    await queryInterface.removeColumn("wrike_credentials", "is_visible");
  },
};
