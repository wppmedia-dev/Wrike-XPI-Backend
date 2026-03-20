import { decryptField } from "../../../../utils/crypto";
import { WrikeCredentials } from "../../../../controllers";

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
