import { GetResponse } from "../../../utils/node-fetch";
import { defaultParser } from "@odata/parser";
import customFieldIdMeta from "../utils/customFieldsIds";

export const GetAllCampaigns = (wrikeToken, params, fastify) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!wrikeToken)
        return reject({
          statusCode: 403,
          message:
            "Failed authorization! User is not authorized to access the service.",
        });

      // Variable Declaration
      const { filter: filterParams, pageSize } = params;

      let filters;

      if (filterParams) {
        filters = defaultParser.filter(filterParams);

        if (!filters)
          return reject({
            statusCode: 400,
            message: "Request is not supported!",
          });
      }

      const customFieldIds = customFieldIdMeta["live"];

      // Get folder data
      const wrikeFolderData = await GetResponse(
        `${process.env.WRIKE_ENDPOINT}/spaces/${process.env.CAMPAIGN_SPACE_ID}/folders?project=false&fields=[customFields]&pageSize=${pageSize}&nextPageToken=`,
        "GET",
        {
          "content-type": "application/json",
          Authorization: `Bearer ${wrikeToken}`,
        }
      );

      // Sending folder update error response
      if (wrikeFolderData?.errorDescription) {
        return reject({ message: wrikeFolderData?.errorDescription });
      }

      const data = wrikeFolderData?.data;

      let campaigns = [];

      for (const folder of data) {
        const folderCustomFieldValues = {};

        for (const [key, value] of Object.entries(customFieldIds)) {
          const cfValue =
            folder?.customFields?.find((field) => field.id === value)?.value ??
            "";

          folderCustomFieldValues[key] = cfValue;
        }

        campaigns.push({
          customfieldlist: folder?.customFields,
          noofcrs: folderCustomFieldValues["# CRs"],
          agency: folderCustomFieldValues["Agency*"],
          mediabuyingtype: folderCustomFieldValues["Biddable/Non-Biddable*"],
          brand: folderCustomFieldValues["Brand*"],
          briefeddate: folderCustomFieldValues["Briefed Date*"],
          campaignbudget: folderCustomFieldValues["Campaign Budget*"],
          campaignenddate: folderCustomFieldValues["Campaign End Date*"],
          campaignid: folderCustomFieldValues["Campaign ID*"],
          campaignname: folderCustomFieldValues["Campaign Name*"],
          campaignobjective: folderCustomFieldValues["Campaign Objective*"],
          campaignstartdate: folderCustomFieldValues["Campaign Start Date*"],
          campaignfeedbackstatus:
            folderCustomFieldValues["CampaignFeedbackStatus*"],
          ccuid: folderCustomFieldValues["CCUID*"],
          mediachannelpractice: folderCustomFieldValues["Channel/Practice*"],
          client: folderCustomFieldValues["Client*"],
          comments: folderCustomFieldValues["Comments*"],
          cssid: folderCustomFieldValues["CSSID*"],
          currency: folderCustomFieldValues["Currency"],
          customerponumber: folderCustomFieldValues["PO Number"],
          debtor: folderCustomFieldValues["Debtor*"],
          kpiobjective: folderCustomFieldValues["KPI Objective*"],
          originalagency: folderCustomFieldValues["Original Agency*"],
          readyforarchive: folderCustomFieldValues["ReadyForArchive*"],
          region: folderCustomFieldValues["Region*"],
          requestedstartdate: folderCustomFieldValues["Requested Start Date*"],
          requestormarket: folderCustomFieldValues["Requestor's Market*"],
          spacename: folderCustomFieldValues["Space Name*"],
          workitemlevel: folderCustomFieldValues["Work Item Level"],
        });
      }

      // Sending final response
      resolve({
        type: "Campaign",
        data: campaigns,
      });
    } catch (err) {
      console.log(err?.message || err);
      reject({
        message:
          "Fatal error Unexpected error occurred and service is unable complete the request.",
      });
    }
  });
};
