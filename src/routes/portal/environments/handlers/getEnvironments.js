import { decryptField } from "../../../../utils/crypto";
import { scopedEnvironmentsFor } from "../../../../utils/portalScope";
import { EnvironmentModulePermissions } from "../../../../controllers";
import { summarisePermissions } from "../../../../utils/tokenPermissionSummary";

export const GetMyEnvironments = (portalUser) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Admin role sees ALL environments; regular users see only those mapped
      // to them. The rule itself lives in src/utils/portalScope.js, shared with
      // the API Tokens page so the two cannot disagree about what a user can
      // see (a token list is scoped by exactly this).
      const environments = await scopedEnvironmentsFor(portalUser);

      // The module ceiling each of these environments holds its tokens to, in
      // the same summary shape the admin console shows. One extra query for the
      // page, not one per row.
      const matrices =
        await EnvironmentModulePermissions.GetMatrixForEnvironments(
          (environments || []).map((env) => env.id),
        );

      const data = (environments || []).map((env) => ({
        id: env.id,
        environment_name: env.environment_name,
        client_id: env.client_id ? decryptField(env.client_id) : null,
        client_secret: env.client_secret
          ? decryptField(env.client_secret)
          : null,
        account_id: env.account_id || null,
        xpi_api_modules_datahub_id: env.xpi_api_modules_datahub_id || null,
        xpi_api_services_datahub_id: env.xpi_api_services_datahub_id || null,
        xpi_entity_datahub_id: env.xpi_entity_datahub_id || null,
        xpi_field_mapping_datahub_id: env.xpi_field_mapping_datahub_id || null,
        xpi_request_form_field_mapping_datahub_id:
          env.xpi_request_form_field_mapping_datahub_id || null,
        xpi_request_form_mapping_datahub_id:
          env.xpi_request_form_mapping_datahub_id || null,
        xpi_space_name_datahub_id: env.xpi_space_name_datahub_id || null,
        campaign_space_id: env.campaign_space_id || null,
        is_active: env.is_active,
        is_visible: env.is_visible,
        // Read by the portal's environment-access drawer (EnvironmentAccess
        // canWrite=false) to show the two gate switches in their real state
        // — omitting them would render both as unchecked regardless of the
        // actual value, which is misleading on a page whose whole point is
        // showing access scope accurately.
        allowlist_check_enabled: env.allowlist_check_enabled !== false,
        custom_field_check_enabled: !!env.custom_field_check_enabled,
        // No rows means no ceiling, which summarisePermissions already says
        // without this handler repeating the rule.
        module_permissions: summarisePermissions(matrices[env.id]),
        created_at: env.created_at,
        updated_at: env.updated_at,
      }));

      return resolve({
        statusCode: 200,
        message: "Environments retrieved",
        data,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject(err);
    }
  });
};
