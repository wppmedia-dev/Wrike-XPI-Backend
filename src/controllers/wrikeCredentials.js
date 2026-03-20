import models from "../../models";

// Save or update Wrike credentials by environment name
export const Upsert = async (environmentName, data) => {
  try {
    if (!environmentName || typeof environmentName !== "string") {
      throw {
        statusCode: 400,
        message: "Invalid environment name",
      };
    }

    // Check if environment_name already exists
    const existingCredential = await models.WrikeCredentials.findOne({
      where: {
        environment_name: environmentName,
        deleted_at: null,
      },
    });

    if (existingCredential) {
      // Update existing
      const updated = await models.WrikeCredentials.update(data, {
        where: {
          id: existingCredential.id,
        },
        individualHooks: true,
      });
      return updated;
    } else {
      // Create new
      const created = await models.WrikeCredentials.create({
        environment_name: environmentName,
        ...data,
      });
      return created;
    }
  } catch (err) {
    throw err;
  }
};

// Get credentials by environment name
export const GetByType = async (environmentName) => {
  try {
    if (!environmentName || typeof environmentName !== "string") {
      throw {
        statusCode: 400,
        message: "Invalid environment name",
      };
    }

    const credential = await models.WrikeCredentials.findOne({
      where: {
        environment_name: environmentName,
        is_active: true,
        deleted_at: null,
      },
    });

    return credential;
  } catch (err) {
    throw err;
  }
};

// Get all active credentials
export const GetAll = async () => {
  try {
    const credentials = await models.WrikeCredentials.findAll({
      where: {
        is_active: true,
        deleted_at: null,
      },
      order: [["created_at", "DESC"]],
    });

    return credentials;
  } catch (err) {
    throw err;
  }
};

// Deactivate credentials by environment name
export const Deactivate = async (environmentName) => {
  try {
    if (!environmentName || typeof environmentName !== "string") {
      throw {
        statusCode: 400,
        message: "Invalid environment name",
      };
    }

    const updated = await models.WrikeCredentials.update(
      { is_active: false },
      {
        where: {
          environment_name: environmentName,
        },
        individualHooks: true,
      },
    );

    return updated;
  } catch (err) {
    throw err;
  }
};

// Delete credentials (soft delete) by environment name
export const Delete = async (environmentName) => {
  try {
    if (!environmentName || typeof environmentName !== "string") {
      throw {
        statusCode: 400,
        message: "Invalid environment name",
      };
    }

    const credential = await models.WrikeCredentials.findOne({
      where: {
        environment_name: environmentName,
      },
    });

    if (credential) {
      await credential.destroy();
    }

    return credential;
  } catch (err) {
    throw err;
  }
};
