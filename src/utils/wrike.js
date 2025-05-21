import { getSecrets } from "./azure_vault";
import { GetResponse } from "./node-fetch";
require("dotenv").config();

const { WRIKE_LOGIN_ENDPOINT, WRIKE_REDIRECT_URL } = process.env;

export const getWrikeTokens = async ({ code, refresh_token }) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!code && !refresh_token)
        return reject({
          message:
            "Missing parameter! Either code or refresh_token must not be empty",
        });

      const secretValues = await getSecrets([
        "XPI-API-ClientId",
        "XPI-API-ClientSecret",
      ]);

      const WRIKE_CLIENT_ID = secretValues["XPI-API-ClientId"];
      const WRIKE_CLIENT_SECRET = secretValues["XPI-API-ClientSecret"];

      if (!WRIKE_LOGIN_ENDPOINT || !WRIKE_CLIENT_ID || !WRIKE_CLIENT_SECRET) {
        return reject({
          message: "Unable to fetch token! Please try after sometimes",
        });
      }

      const url = `${WRIKE_LOGIN_ENDPOINT}/token`;

      let payload = {
        client_id: WRIKE_CLIENT_ID,
        client_secret: WRIKE_CLIENT_SECRET,
        grant_type: code ? "authorization_code" : "refresh_token",
        redirect_uri: WRIKE_REDIRECT_URL,
      };

      if (code) payload.code = code;

      if (refresh_token) payload.refresh_token = refresh_token;

      const result = await GetResponse(
        url,
        "POST",
        {
          "content-type": "application/x-www-form-urlencoded",
        },
        payload
      );

      if (result?.error)
        return reject({ message: result["error_description"] });

      resolve(result);
    } catch (err) {
      console.log("Error while getting access token: ", err?.message ?? err);
      reject(err);
    }
  });
};
