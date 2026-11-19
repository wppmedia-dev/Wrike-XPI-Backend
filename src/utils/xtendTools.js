/**
 * Whether an environment's MCP server offers the native xtend_* tools.
 *
 * Two things must both hold:
 *   1. the environment's `xtend_tools_enabled` switch is on, and
 *   2. every Datahub ID / space ID those tools run against is filled in.
 *
 * The second is not a courtesy check. An empty ID falls through to the global
 * DATAHUB_* value in .env (getDatahubIdForEnvironment), i.e. another
 * environment's data, or to `undefined` and a request to
 * `.../databases/undefined/...`. So "on" with a blank ID is treated as off
 * rather than trusted.
 *
 * The two Amoeba IDs are not in the list: they feed the Amoeba REST routes,
 * which already refuse cleanly when they are blank, and no xtend_* tool reads
 * them.
 */

/** Keys on the cached credential (src/utils/wrikeCredentials.js). */
export const XTEND_REQUIRED_DATAHUB_IDS = [
  "xpiEntityDatahubId",
  "xpiFieldMappingDatahubId",
  "xpiRequestFormFieldMappingDatahubId",
  "xpiRequestFormMappingDatahubId",
  "xpiSpaceNameDatahubId",
  // Not a Datahub ID, but the campaign tools read it the same way.
  "campaignSpaceId",
];

/** The required Datahub ID keys that are blank for this credential. */
export const missingXtendDatahubIds = (credential) =>
  XTEND_REQUIRED_DATAHUB_IDS.filter(
    (key) => !String(credential?.[key] ?? "").trim(),
  );

/**
 * @param {object|null|undefined} credential cached credential for the environment
 * @returns {boolean} false for an unknown environment: no record, no tools
 */
export const xtendToolsActive = (credential) =>
  !!credential &&
  credential.xtendToolsEnabled !== false &&
  missingXtendDatahubIds(credential).length === 0;
