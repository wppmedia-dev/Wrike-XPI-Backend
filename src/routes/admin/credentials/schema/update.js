export const UpdateSchema = {
  schema: {
    params: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
    body: {
      type: "object",
      required: [
        "environment_name",
        "client_id",
        "client_secret",
      ],
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
        campaign_space_id: { type: "string" },
        wrike_api_host: { type: "string" },
        mcp_access_token_ttl_seconds: { type: ["integer", "null"] },
        mcp_refresh_token_ttl_seconds: { type: ["integer", "null"] },
        is_visible: { type: "boolean" },
        xtend_tools_enabled: { type: "boolean" },
      },
    },
  },
};
