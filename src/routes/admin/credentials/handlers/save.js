import { encryptField, decryptField } from "../../../../utils/crypto";
import { syncWrikeCredentialsFromDB } from "../../../../utils/wrikeCredentials";
import { WrikeCredentials } from "../../../../controllers";

export const Save = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        profile_id,
        environment_name,
        client_id,
        client_secret,
        account_id,
        xpi_api_modules_datahub_id,
        xpi_api_services_datahub_id,
        xpi_entity_datahub_id,
        xpi_field_mapping_datahub_id,
        xpi_request_form_field_mapping_datahub_id,
        xpi_request_form_mapping_datahub_id,
        xpi_space_name_datahub_id,
      } = body;

      if (!environment_name)
        return reject({
          statusCode: 400,
          message: "environment_name is required",
        });

      if (!client_id && !client_secret)
        return reject({
          statusCode: 400,
          message: "At least one credential field is required",
        });

      const existing = await WrikeCredentials.GetByType(environment_name);
      if (existing)
        return reject({
          statusCode: 400,
          message: "Environment name already exists",
        });

      const credential = await WrikeCredentials.Insert(profile_id, {
        environment_name,
        client_id: client_id ? encryptField(client_id) : null,
        client_secret: client_secret ? encryptField(client_secret) : null,
        account_id: account_id || null,
        xpi_api_modules_datahub_id: xpi_api_modules_datahub_id || null,
        xpi_api_services_datahub_id: xpi_api_services_datahub_id || null,
        xpi_entity_datahub_id: xpi_entity_datahub_id || null,
        xpi_field_mapping_datahub_id: xpi_field_mapping_datahub_id || null,
        xpi_request_form_field_mapping_datahub_id:
          xpi_request_form_field_mapping_datahub_id || null,
        xpi_request_form_mapping_datahub_id:
          xpi_request_form_mapping_datahub_id || null,
        xpi_space_name_datahub_id: xpi_space_name_datahub_id || null,
      });

      await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 201,
        message: "Credential saved successfully",
        data: { id: credential?.id },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};

const formatCredential = (cred) => ({
  id: cred.id,
  environment_name: cred.environment_name,
  client_id: cred.client_id ? decryptField(cred.client_id) : null,
  client_secret: cred.client_secret ? decryptField(cred.client_secret) : null,
  account_id: cred.account_id || null,
  xpi_api_modules_datahub_id: cred.xpi_api_modules_datahub_id || null,
  xpi_api_services_datahub_id: cred.xpi_api_services_datahub_id || null,
  xpi_entity_datahub_id: cred.xpi_entity_datahub_id || null,
  xpi_field_mapping_datahub_id: cred.xpi_field_mapping_datahub_id || null,
  xpi_request_form_field_mapping_datahub_id:
    cred.xpi_request_form_field_mapping_datahub_id || null,
  xpi_request_form_mapping_datahub_id:
    cred.xpi_request_form_mapping_datahub_id || null,
  xpi_space_name_datahub_id: cred.xpi_space_name_datahub_id || null,
  is_active: cred.is_active,
});
