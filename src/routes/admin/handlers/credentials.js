import { encryptField, decryptField } from "../../../utils/crypto";
import { syncWrikeCredentialsFromDB } from "../../../utils/wrikeCredentials";
import { WrikeCredentials } from "../../../controllers";

export const GetAll = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const credentials = await WrikeCredentials.GetAllWithDeleted();

      const data = credentials.map((cred) => ({
        id: cred.id,
        environment_name: cred.environment_name,
        api_client_id: cred.api_client_id
          ? decryptField(cred.api_client_id)
          : null,
        api_client_secret: cred.api_client_secret || null,
        automation_client_id: cred.automation_client_id
          ? decryptField(cred.automation_client_id)
          : null,
        automation_client_secret: cred.automation_client_secret || null,
        is_active: cred.is_active,
        created_at: cred.created_at,
        updated_at: cred.updated_at,
      }));

      return resolve({
        statusCode: 200,
        message: "Credentials retrieved",
        data,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};

export const Save = (body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        id,
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

      let credential;

      if (id) {
        credential = await WrikeCredentials.GetById(id);
        if (!credential)
          return reject({ statusCode: 404, message: "Credential not found" });

        const existing = await WrikeCredentials.GetByType(environment_name);
        if (existing && existing.id !== id)
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
        credential = await WrikeCredentials.GetById(id);
      } else {
        const existing = await WrikeCredentials.GetByType(environment_name);
        if (existing)
          return reject({
            statusCode: 400,
            message: "Environment name already exists",
          });

        credential = await WrikeCredentials.Create({
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
      }

      await syncWrikeCredentialsFromDB();

      const data = {
        id: credential.id,
        environment_name: credential.environment_name,
        api_client_id: credential.api_client_id
          ? decryptField(credential.api_client_id)
          : null,
        api_client_secret: credential.api_client_secret
          ? decryptField(credential.api_client_secret)
          : null,
        automation_client_id: credential.automation_client_id
          ? decryptField(credential.automation_client_id)
          : null,
        automation_client_secret: credential.automation_client_secret
          ? decryptField(credential.automation_client_secret)
          : null,
        is_active: credential.is_active,
      };

      return resolve({
        statusCode: 200,
        message: `Credential ${id ? "updated" : "saved"} successfully`,
        data,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};

export const Delete = ({ id }) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!id)
        return reject({
          statusCode: 400,
          message: "Credential id is required",
        });

      const credential = await WrikeCredentials.GetById(id);
      if (!credential)
        return reject({ statusCode: 404, message: "Credential not found" });

      await WrikeCredentials.Delete(id);
      await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 200,
        message: "Credential deleted successfully",
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
