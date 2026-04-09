import { decryptField } from "../../../../utils/crypto";
import { WrikeCredentials } from "../../../../controllers";

export const GetAll = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const credentials = await WrikeCredentials.GetAllWithDeleted();

      const data = credentials.map((cred) => ({
        id: cred.id,
        environment_name: cred.environment_name,
        client_id: cred.client_id ? decryptField(cred.client_id) : null,
        client_secret: cred.client_secret || null,
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
