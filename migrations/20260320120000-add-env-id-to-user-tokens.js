"use strict";
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add env_id column with foreign key constraint
    await queryInterface.addColumn("user_tokens", "env_id", {
      type: Sequelize.UUID,
      allowNull: true,
      comment: "Reference to wrike credentials environment",
      references: {
        model: "wrike_credentials",
        key: "id",
      },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the env_id column (foreign key constraint will be removed automatically)
    await queryInterface.removeColumn("user_tokens", "env_id");
  },
};
