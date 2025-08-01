import fetch from "node-fetch";
import qs from "qs";

export const GetResponse = (url, method, headers, body, isBinary = false) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!headers) {
        headers = {
          "content-type": "application/json",
        };
      }

      let requestBody = null;

      if (body) {
        if (isBinary) {
          requestBody = body;
        } else if (
          headers["content-type"] == "application/x-www-form-urlencoded"
        ) {
          requestBody = qs.stringify(body);
        } else {
          requestBody = JSON.stringify(body);
        }
      }

      const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
      });

      if (response.status == 204) {
        resolve({});
        return;
      }

      let data = await response.json();

      resolve(data);
    } catch (err) {
      reject(err);
    }
  });
};
