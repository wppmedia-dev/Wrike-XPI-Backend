import { encryptField, decryptField } from "../../../../utils/crypto";
import { syncWrikeCredentialsFromDB } from "../../../../utils/wrikeCredentials";
import { WrikeCredentials } from "../../../../controllers";

export const Update = ({ id }, body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        environment_name,
        api_client_id,
        api_client_secret,
        automation_client_id,
        automation_client_secret,
      } = body;

      if (!environment_name)
        return reject({
          statusCode: 400,
          message: "environment_name is required",
        });

      if (
        !api_client_id &&
        !api_client_secret &&
        !automation_client_id &&
        !automation_client_secret
      )
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

      const updates = { environment_name };
      if (api_client_id) updates.api_client_id = encryptField(api_client_id);
      if (api_client_secret)
        updates.api_client_secret = encryptField(api_client_secret);
      if (automation_client_id)
        updates.automation_client_id = encryptField(automation_client_id);
      if (automation_client_secret)
        updates.automation_client_secret = encryptField(
          automation_client_secret,
        );

      await WrikeCredentials.Update(id, updates);
      const updated = await WrikeCredentials.GetById(id);

      await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 200,
        message: "Credential updated successfully",
        data: {
          id: updated.id,
          environment_name: updated.environment_name,
          api_client_id: updated.api_client_id
            ? decryptField(updated.api_client_id)
            : null,
          api_client_secret: updated.api_client_secret
            ? decryptField(updated.api_client_secret)
            : null,
          automation_client_id: updated.automation_client_id
            ? decryptField(updated.automation_client_id)
            : null,
          automation_client_secret: updated.automation_client_secret
            ? decryptField(updated.automation_client_secret)
            : null,
          is_active: updated.is_active,
        },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
