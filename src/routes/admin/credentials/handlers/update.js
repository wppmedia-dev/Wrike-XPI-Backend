import { encryptField } from "../../../../utils/crypto";
import { syncWrikeCredentialsFromDB } from "../../../../utils/wrikeCredentials";
import { WrikeCredentials } from "../../../../controllers";

export const Update = (profile_id, { id }, body) => {
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
