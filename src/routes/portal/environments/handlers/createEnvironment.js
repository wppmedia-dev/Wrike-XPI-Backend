import { WrikeCredentials, PortalAuth } from "../../../../controllers";
import { encryptField } from "../../../../utils/crypto";
import { syncWrikeCredentialsFromDB } from "../../../../utils/wrikeCredentials";
import { normalizeWrikeApiHost } from "../../../../utils/wrikeEndpoint";
import { validateEnvironmentMcpLifetimes } from "../../../../utils/mcpTokenSettings";
import {
  mcpLifetimeAccessFor,
  forbidMcpLifetimeChange,
} from "../../../../utils/mcpLifetimeAccess";

export const CreateEnvironment = (portalUser, body) => {
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
        campaign_space_id,
        wrike_api_host,
        mcp_access_token_ttl_seconds,
        mcp_refresh_token_ttl_seconds,
        is_active,
        is_visible,
        xtend_tools_enabled,
      } = body;

      // Its own grant (environment_token_lifetimes:update), not part of
      // environments:create: a lifetime is a security setting.
      if (
        (mcp_access_token_ttl_seconds !== undefined ||
          mcp_refresh_token_ttl_seconds !== undefined) &&
        !(await mcpLifetimeAccessFor(portalUser)).update
      ) {
        return reject(forbidMcpLifetimeChange());
      }

      if (!environment_name || !environment_name.trim())
        return reject({
          statusCode: 400,
          message: "Environment name is required",
        });
      if (!client_id || !client_id.trim())
        return reject({ statusCode: 400, message: "Client ID is required" });
      if (!client_secret || !client_secret.trim())
        return reject({
          statusCode: 400,
          message: "Client Secret is required",
        });
      // The xpi_*_datahub_id fields and campaign_space_id are optional; a blank one
      // is stored as null.

      const apiHost = normalizeWrikeApiHost(wrike_api_host);
      const mcpLifetimes = await validateEnvironmentMcpLifetimes({
        accessTtlSeconds: mcp_access_token_ttl_seconds,
        refreshTtlSeconds: mcp_refresh_token_ttl_seconds,
      });

      const data = {
        environment_name: environment_name.trim(),
        client_id: encryptField(client_id.trim()),
        client_secret: encryptField(client_secret.trim()),
        account_id: account_id ? account_id.trim() : null,
        xpi_api_modules_datahub_id: xpi_api_modules_datahub_id?.trim() || null,
        xpi_api_services_datahub_id:
          xpi_api_services_datahub_id?.trim() || null,
        xpi_entity_datahub_id: xpi_entity_datahub_id?.trim() || null,
        xpi_field_mapping_datahub_id:
          xpi_field_mapping_datahub_id?.trim() || null,
        xpi_request_form_field_mapping_datahub_id:
          xpi_request_form_field_mapping_datahub_id?.trim() || null,
        xpi_request_form_mapping_datahub_id:
          xpi_request_form_mapping_datahub_id?.trim() || null,
        xpi_space_name_datahub_id: xpi_space_name_datahub_id?.trim() || null,
        campaign_space_id: campaign_space_id?.trim() || null,
        wrike_api_host: apiHost,
        ...mcpLifetimes,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        is_visible: is_visible !== undefined ? Boolean(is_visible) : true,
        xtend_tools_enabled:
          xtend_tools_enabled !== undefined ? Boolean(xtend_tools_enabled) : true,
      };

      // Pass null as profile_id — updated_by FK references admin_users, not portal_users
      const env = await WrikeCredentials.Insert(null, data);

      // Admin portal users create shared envs (no mapping); regular users
      // are mapped to the one they created.
      if (portalUser.role !== "admin") {
        await PortalAuth.AssignEnvironment(null, portalUser.id, env.id);
      }

      await syncWrikeCredentialsFromDB();

      return resolve({
        statusCode: 201,
        message: "Environment created",
        data: {
          id: env.id,
          environment_name: env.environment_name,
          account_id: env.account_id || null,
          is_active: env.is_active,
          is_visible: env.is_visible,
        },
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
