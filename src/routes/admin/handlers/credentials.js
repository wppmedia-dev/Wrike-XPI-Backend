import { VerifyAdminSession } from "../../../controllers/adminAuth";
import { syncWrikeCredentialsFromDB } from "../../../utils/wrikeCredentials";
import { WrikeCredentials } from "../../../../models";
import { encryptField, decryptField } from "../../../utils/crypto";
import { Op } from "sequelize";

// Get all credentials (requires verified session)
export const GetAllCredentials = (query, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { session_token } = query;

      if (!session_token) {
        return reject({
          statusCode: 401,
          message: "Session token required",
        });
      }

      // Verify session and TOTP
      const sessionData = await VerifyAdminSession(session_token);

      if (sessionData.totp_required) {
        return reject({
          statusCode: 403,
          message: "TOTP verification required",
        });
      }

      // Get all credentials (non-soft-deleted only)
      const credentials = await WrikeCredentials.findAll({
        where: { deleted_at: null },
        order: [["created_at", "DESC"]],
      });

      // Decrypt only the two ID fields, leave secrets encrypted in response.
      const decryptedCredentials = credentials.map((cred) => ({
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
        data: decryptedCredentials,
      });
    } catch (err) {
      console.error("Error getting credentials:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

// Save credential with all 5 fields (encrypted)
export const SaveCredential = (body, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        session_token,
        id,
        environment_name,
        api_client_id,
        api_client_secret,
        automation_client_id,
        automation_client_secret,
      } = body;

      if (!session_token) {
        return reject({
          statusCode: 401,
          message: "Session token required",
        });
      }

      if (!environment_name) {
        return reject({
          statusCode: 400,
          message: "environment_name is required",
        });
      }

      // At least one credential type must be provided
      if (
        !api_client_id &&
        !api_client_secret &&
        !automation_client_id &&
        !automation_client_secret
      ) {
        return reject({
          statusCode: 400,
          message:
            "At least one of api_client_id, api_client_secret, automation_client_id, or automation_client_secret is required",
        });
      }

      // Verify session and TOTP
      const sessionData = await VerifyAdminSession(session_token);

      if (sessionData.totp_required) {
        return reject({
          statusCode: 403,
          message: "TOTP verification required",
        });
      }

      let credential;

      if (id) {
        // Update existing credential
        credential = await WrikeCredentials.findByPk(id);
        if (!credential) {
          return reject({
            statusCode: 404,
            message: "Credential not found",
          });
        }

        // Check if environment_name already exists (excluding current record)
        const existing = await WrikeCredentials.findOne({
          where: {
            environment_name: environment_name,
            id: { [Op.ne]: id },
            deleted_at: null,
          },
        });

        if (existing) {
          return reject({
            statusCode: 400,
            message: "Environment name already exists",
          });
        }

        // Encrypt and update fields
        credential.environment_name = environment_name;
        if (api_client_id)
          credential.api_client_id = encryptField(api_client_id);
        if (api_client_secret)
          credential.api_client_secret = encryptField(api_client_secret);
        if (automation_client_id)
          credential.automation_client_id = encryptField(automation_client_id);
        if (automation_client_secret)
          credential.automation_client_secret = encryptField(
            automation_client_secret,
          );
        await credential.save();
      } else {
        // Create new credential
        // Check if environment_name already exists
        const existing = await WrikeCredentials.findOne({
          where: { environment_name, deleted_at: null },
        });

        if (existing) {
          return reject({
            statusCode: 400,
            message: "Environment name already exists",
          });
        }

        credential = await WrikeCredentials.create({
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

      // Re-sync cache
      await syncWrikeCredentialsFromDB();

      // Return decrypted credential
      const decrypted = {
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
        data: decrypted,
      });
    } catch (err) {
      console.error("Error saving credentials:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};

/**
 * Delete credential (soft delete)
 */
export const DeleteCredential = (params, query, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { id } = params;
      const { session_token } = query;

      if (!session_token) {
        return reject({
          statusCode: 401,
          message: "Session token required",
        });
      }

      // Verify session and TOTP
      const sessionData = await VerifyAdminSession(session_token);

      if (sessionData.totp_required) {
        return reject({
          statusCode: 403,
          message: "TOTP verification required",
        });
      }

      const credential = await WrikeCredentials.findByPk(id);
      if (!credential) {
        return reject({
          statusCode: 404,
          message: "Credential not found",
        });
      }

      // Perform soft delete
      await credential.destroy();

      // Re-sync cache
      await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 200,
        message: "Credential deleted successfully",
      });
    } catch (err) {
      console.error("Error deleting credential:", err);
      return reject({
        statusCode: err?.statusCode || 500,
        message: err?.message || err,
      });
    }
  });
};
