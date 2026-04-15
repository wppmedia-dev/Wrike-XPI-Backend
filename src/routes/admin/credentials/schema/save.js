export const SaveSchema = {
  schema: {
    body: {
      type: "object",
      required: ["environment_name"],
      properties: {
        environment_name: { type: "string" },
        client_id: { type: "string" },
        client_secret: { type: "string" },
        account_id: { type: "string" },
        xpi_api_modules_datahub_id: { type: "string" },
        xpi_api_services_datahub_id: { type: "string" },
        xpi_entity_datahub_id: { type: "string" },
        xpi_field_mapping_datahub_id: { type: "string" },
        xpi_request_form_field_mapping_datahub_id: { type: "string" },
        xpi_request_form_mapping_datahub_id: { type: "string" },
        xpi_space_name_datahub_id: { type: "string" },
        is_visible: { type: "boolean" },
      },
    },
  },
};
