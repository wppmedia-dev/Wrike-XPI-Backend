import { encryptField, decryptField } from "../../../../utils/crypto";
import { syncWrikeCredentialsFromDB } from "../../../../utils/wrikeCredentials";
import { WrikeCredentials } from "../../../../controllers";

const formatCredential = (cred) => ({
  id: cred.id,
  environment_name: cred.environment_name,
  api_client_id: cred.api_client_id ? decryptField(cred.api_client_id) : null,
  api_client_secret: cred.api_client_secret
    ? decryptField(cred.api_client_secret)
    : null,
  automation_client_id: cred.automation_client_id
    ? decryptField(cred.automation_client_id)
    : null,
  automation_client_secret: cred.automation_client_secret
    ? decryptField(cred.automation_client_secret)
    : null,
  is_active: cred.is_active,
});

export const Save = (body) => {
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

      const existing = await WrikeCredentials.GetByType(environment_name);
      if (existing)
        return reject({
          statusCode: 400,
          message: "Environment name already exists",
        });

      const credential = await WrikeCredentials.Create({
        environment_name,
        api_client_id: api_client_id ? encryptField(api_client_id) : null,
        api_client_secret: api_client_secret
          ? encryptField(api_client_secret)
          : null,
        automation_client_id: automation_client_id
          ? encryptField(automation_client_id)
          : null,
        automation_client_secret: automation_client_secret
          ? encryptField(automation_client_secret)
          : null,
      });

      await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 201,
        message: "Credential saved successfully",
        data: formatCredential(credential),
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
