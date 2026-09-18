import { decryptField } from "../../../../utils/crypto";
import {
  EnvironmentModulePermissions,
  WrikeCredentials,
} from "../../../../controllers";
import { applyEnvironmentFilters } from "../../../../utils/environmentFilters";
import { summarisePermissions } from "../../../../utils/tokenPermissionSummary";

/**
 * The Environments list. `search` is the table's search box, applied here so
 * that the answer covers the whole table rather than the page the browser
 * holds (src/utils/environmentFilters.js).
 *
 * Filtered AFTER mapping, on purpose: `client_id` is decrypted in the map
 * below, so the readable value only exists from that point on.
 *
 * Each row also carries `module_permissions`, the same summary shape a token
 * row carries, so the list can show at a glance which environments are
 * restricted without opening every grid. One extra query for the whole page,
 * not one per row.
 */
export const GetAll = ({ search } = {}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const credentials = await WrikeCredentials.GetAllWithDeleted();
      const ownersByEnvId = await WrikeCredentials.GetOwnersByEnvIds(
        credentials.map((cred) => cred.id),
      );
      const matrices =
        await EnvironmentModulePermissions.GetMatrixForEnvironments(
          credentials.map((cred) => cred.id),
        );

      const data = credentials.map((cred) => ({
        id: cred.id,
        environment_name: cred.environment_name,
        client_id: cred.client_id ? decryptField(cred.client_id) : null,
        client_secret: cred.client_secret
          ? decryptField(cred.client_secret)
          : null,
        account_id: cred.account_id || null,
        xpi_api_modules_datahub_id: cred.xpi_api_modules_datahub_id || null,
        xpi_api_services_datahub_id: cred.xpi_api_services_datahub_id || null,
        xpi_entity_datahub_id: cred.xpi_entity_datahub_id || null,
        xpi_field_mapping_datahub_id: cred.xpi_field_mapping_datahub_id || null,
        xpi_request_form_field_mapping_datahub_id:
          cred.xpi_request_form_field_mapping_datahub_id || null,
        xpi_request_form_mapping_datahub_id:
          cred.xpi_request_form_mapping_datahub_id || null,
        xpi_space_name_datahub_id: cred.xpi_space_name_datahub_id || null,
        campaign_space_id: cred.campaign_space_id || null,
        owners: ownersByEnvId[cred.id] || [],
        // No rows means unrestricted, which summarisePermissions already says
        // without this module having to repeat the rule.
        module_permissions: summarisePermissions(matrices[cred.id]),
        is_active: cred.is_active,
        is_visible: cred.is_visible,
        allowlist_check_enabled: cred.allowlist_check_enabled,
        custom_field_check_enabled: cred.custom_field_check_enabled,
        created_at: cred.created_at,
        updated_at: cred.updated_at,
      }));

      return resolve({
        statusCode: 200,
        message: "Credentials retrieved",
        data: applyEnvironmentFilters(data, { search }),
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
