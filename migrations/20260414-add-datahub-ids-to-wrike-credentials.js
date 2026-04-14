"use strict";

module.exports = {
  async up(queryInterface, DataTypes) {
    await queryInterface.addColumn("wrike_credentials", "xpi_api_modules_datahub_id", {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "XPI API Modules Datahub ID",
    });

    await queryInterface.addColumn("wrike_credentials", "xpi_api_services_datahub_id", {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "XPI API Services Datahub ID",
    });

    await queryInterface.addColumn("wrike_credentials", "xpi_entity_datahub_id", {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "XPI Entity Datahub ID",
    });

    await queryInterface.addColumn("wrike_credentials", "xpi_field_mapping_datahub_id", {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "XPI Field Mapping Datahub ID",
    });

    await queryInterface.addColumn("wrike_credentials", "xpi_request_form_field_mapping_datahub_id", {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "XPI Request Form Field Mapping Datahub ID",
    });

    await queryInterface.addColumn("wrike_credentials", "xpi_request_form_mapping_datahub_id", {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "XPI Request Form Mapping Datahub ID",
    });

    await queryInterface.addColumn("wrike_credentials", "xpi_space_name_datahub_id", {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "XPI Space Name Datahub ID",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("wrike_credentials", "xpi_api_modules_datahub_id");
    await queryInterface.removeColumn("wrike_credentials", "xpi_api_services_datahub_id");
    await queryInterface.removeColumn("wrike_credentials", "xpi_entity_datahub_id");
    await queryInterface.removeColumn("wrike_credentials", "xpi_field_mapping_datahub_id");
    await queryInterface.removeColumn("wrike_credentials", "xpi_request_form_field_mapping_datahub_id");
    await queryInterface.removeColumn("wrike_credentials", "xpi_request_form_mapping_datahub_id");
    await queryInterface.removeColumn("wrike_credentials", "xpi_space_name_datahub_id");
  },
};
