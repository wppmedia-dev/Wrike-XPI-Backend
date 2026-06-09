import { PortalAuth } from "../../../../controllers";

export const AssignEnv = (adminUser, params, body) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { id } = params;
      const { env_id } = body;

      if (!id || !env_id)
        return reject({
          statusCode: 400,
          message: "User ID and env_id are required",
        });

      await PortalAuth.AssignEnvironment(adminUser.id, id, env_id);

      return resolve({
        statusCode: 200,
        message: "Environment assigned to user",
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};

export const RevokeEnv = (params, query) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { id } = params;
      const { env_id } = query;

      if (!id || !env_id)
        return reject({
          statusCode: 400,
          message: "User ID and env_id are required",
        });

      await PortalAuth.RevokeEnvironment(id, env_id);

      return resolve({
        statusCode: 200,
        message: "Environment access revoked",
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
