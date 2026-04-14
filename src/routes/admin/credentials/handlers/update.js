import { encryptField } from "../../../../utils/crypto";
import { syncWrikeCredentialsFromDB } from "../../../../utils/wrikeCredentials";
import { WrikeCredentials } from "../../../../controllers";

export const Update = (profile_id, { id }, body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
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

      const credential = await WrikeCredentials.GetById(id);
      if (!credential)
        return reject({ statusCode: 404, message: "Credential not found" });

      const existing = await WrikeCredentials.GetByType(environment_name);
      if (existing && existing.id !== credential.id)
        return reject({
          statusCode: 400,
          message: "Environment name already exists",
        });

      const updates = {
        environment_name,
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
      };
      if (client_id) updates.client_id = encryptField(client_id);
      if (client_secret && client_secret != existing?.client_secret)
        updates.client_secret = encryptField(client_secret);

      const updated = await WrikeCredentials.Update(profile_id, id, updates);

      await syncWrikeCredentialsFromDB();

      let message = "Credential updated successfully";
      let statusCode = 200;

      if (updated[0] <= 0) {
        message = "Credentials updated failed! Please try after sometimes";
        statusCode = 400;
      }

      return resolve({
        statusCode,
        message,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
