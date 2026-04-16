"use strict";
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add campaign_space_id columns to wrike_credentials table
    await queryInterface.addColumn("wrike_credentials", "campaign_space_id", {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: "Campaign Space ID for Wrike DataHub",
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove columns if migration is rolled back
    await queryInterface.removeColumn("wrike_credentials", "campaign_space_id");
  },
};
