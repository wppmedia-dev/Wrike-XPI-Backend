import { getDatahubFields, getDatahubRecords } from "../../../utils/wrike";

export const getCustomFieldsDatahub = async (wrikeToken) => {
  try {
    const datahubFields = await getDatahubFields(
      wrikeToken,
      process.env.DATAHUB_CUSTOM_FIELDS_ID
    );

    if (datahubFields?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubFields?.errorDescription,
      });
    }

    let formFieldsIds = {};
    datahubFields?.data?.forEach((field) => {
      formFieldsIds[field.title?.trim()?.toLowerCase()] = field.id;
    });

    const datahubRecords = await getDatahubRecords(
      wrikeToken,
      process.env.DATAHUB_CUSTOM_FIELDS_ID
    );

    if (datahubRecords?.errorDescription) {
      return Promise.reject({
        errorDescription: datahubRecords?.errorDescription,
      });
    }

    let datahubCustomFieldsData = {};
    datahubRecords?.data?.forEach((record) => {
      if (record.fieldValues[formFieldsIds["short code"]]?.trim())
        datahubCustomFieldsData[
          record.fieldValues[formFieldsIds["short code"]]?.trim()?.toLowerCase()
        ] = {
          id: record.id,
          ["cfId"]: record.fieldValues[formFieldsIds["cf id"]],
          isTaskField: record.fieldValues[formFieldsIds["channel task"]],
          isWritable: record.fieldValues[formFieldsIds["api access"]]
            ?.toLowerCase()
            ?.includes("write"),
          isReadable: record.fieldValues[formFieldsIds["api access"]]
            ?.toLowerCase()
            ?.includes("read"),
        };
    });

    return Promise.resolve(datahubCustomFieldsData);
  } catch (err) {
    return Promise.reject(err);
  }
};
