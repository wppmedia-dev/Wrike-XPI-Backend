import { normalizeString } from "../../../utils/json-conversion";
import { getDatahubRecord } from "../../../utils/wrike";

export const translateDatahubRecordId = async (
  wrikeToken,
  databaseId,
  originalValue,
) => {
  try {
    if (!originalValue) return originalValue;

    const recordId =
      typeof originalValue === "string"
        ? normalizeString(originalValue)
        : originalValue;

    if (recordId.length === 0) return null;

    let finalValue = originalValue || "";

    // If source database ID is available and target database ID is not, fetch the record title from the source database

    const datahubRecords = await getDatahubRecord(
      wrikeToken,
      databaseId,
      Array.isArray(recordId) && recordId[0],
    );
    finalValue = datahubRecords?.title || "";

    return finalValue;
  } catch (error) {
    throw error;
  }
};
