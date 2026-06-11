"use strict";

// Importing Modules to Start Server
import AutoLoad from "@fastify/autoload";
import path from "path";
import Fastify from "fastify";
import dotenv from "dotenv";
dotenv.config();

// Importing Routes
import { PrivateRouters, PublicRouters } from "./routes";
import { adminRoute } from "./routes/admin";
import { portalRoute } from "./routes/portal";
import { syncSecrets } from "./utils/azure_vault";
import {
  syncWrikeCredentialsFromDB,
  getCachedWrikeCredentials,
  getCachedVisibleWrikeCredentials,
} from "./utils/wrikeCredentials";

(async () => {
  // Configure the framework and instantiate it
  const fastify = Fastify({
    logger: true,
  });

  // app.use(express.static("public"));
  // app.set("view engine", "ejs");

  // This loads all plugins defined in plugins those should be support plugins that are reused through your application
  fastify.register(AutoLoad, {
    dir: path.join(process.cwd(), "/src/plugins"),
  });

  // fastify.get("/", (req, res) => {
  //   res.code(200).send({ message: "Server is running..." });
  // });

  //routes
  fastify.register(PublicRouters, { prefix: "/api/v1" });
  fastify.register(PrivateRouters, { prefix: "/api/v1" });
  fastify.register(adminRoute, { prefix: "/admin" });
  fastify.register(portalRoute, { prefix: "/portal" });

  // Hooks
  fastify.addHook("onError", async (request, reply, error) => {
    console.log(new Date() + " : " + error?.message || error);
    reply.code(500).send({ success: false, message: error?.message || error });
  });

  // fastify.addHook("onSend", function (request, reply, payload, done) {
  //   try {
  //     if (!reply.sent && payload) {
  //       done(null, payload);
  //     }
  //   } catch (err) {
  //     console.error(new Date().toISOString() + " : " + err?.message || err);
  //   }
  // });

  // Health check endpoint
  fastify.all("/health", async (request, reply) => {
    const healthcheck = {
      uptime: process.uptime(),
      message: "OK",
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage(),
      version: process.version,
    };
    try {
      reply.code(200).send(healthcheck);
    } catch (error) {
      healthcheck.message = error;
      reply.code(503).send(healthcheck);
    }
  });

  // Sync Secrets from Azure Vault at Startup
  await syncSecrets([
    "XPI-API-ClientId",
    "XPI-API-ClientSecret",
    "XPI-API-Token",
  ]);

  // Sync Wrike Credentials from Database at Startup
  try {
    await syncWrikeCredentialsFromDB();
  } catch (err) {
    console.error(
      "Error syncing Wrike credentials from DB at startup:",
      err.message,
    );
  }

  fastify.get("/api/v1/sync-secrets", async (req, res) => {
    try {
      await syncSecrets([
        "XPI-API-ClientId",
        "XPI-API-ClientSecret",
        "XPI-API-Token",
      ]);
      console.log("Secrets synchronized successfully");
      res.send({ success: true, message: "Secrets synchronized successfully" });
    } catch (err) {
      res.status(500).send({ success: false, message: err.message || err });
    }
  });

  // Sync Wrike Credentials from Database
  fastify.get("/api/v1/sync-db-credentials", async (req, res) => {
    try {
      await syncWrikeCredentialsFromDB();
      console.log("Database credentials synchronized successfully");
      res.send({
        success: true,
        message: "Database credentials synchronized successfully",
      });
    } catch (err) {
      res.status(500).send({ success: false, message: err.message || err });
    }
  });

  // Generate redirect URL dynamically based on environment selection
  fastify.get("/get-redirect-url", async (req, res) => {
    const { environment, environmentId, redirectUri, accountId } = req.query;
    const { WRIKE_LOGIN_ENDPOINT, WRIKE_REDIRECT_URL } = process.env;

    if (!WRIKE_LOGIN_ENDPOINT || !WRIKE_REDIRECT_URL) {
      return res.status(400).send({
        success: false,
        message: "Missing WRIKE_LOGIN_ENDPOINT or WRIKE_REDIRECT_URL",
      });
    }

    const allCreds = getCachedWrikeCredentials();

    // Resolve environment: prioritize environmentId parameter, then environment parameter
    let resolvedEnvironment = "";
    if (environmentId) {
      // Find environment by ID
      for (const [envName, envData] of Object.entries(allCreds || {})) {
        if (envData?.id == environmentId) {
          resolvedEnvironment = envName;
          break;
        }
      }
    } else if (environment) {
      resolvedEnvironment = environment;
    }

    const selectedCred = resolvedEnvironment
      ? allCreds?.[resolvedEnvironment]
      : null;
    const WRIKE_CLIENT_ID =
      selectedCred?.clientId || process.env.WRIKE_CLIENT_ID;

    if (!WRIKE_CLIENT_ID) {
      return res.status(400).send({
        success: false,
        message: "Missing WRIKE_CLIENT_ID",
      });
    }

    // Generate state JWT with environment and redirectUri context
    let state = "";
    if (redirectUri) {
      state = fastify.jwt.sign({
        redirectUri,
        environmentId: selectedCred?.id,
      });
    } else {
      state = fastify.jwt.sign({
        environmentId: selectedCred?.id,
      });
    }

    let redirectUrl = `${WRIKE_LOGIN_ENDPOINT}/authorize/v4?client_id=${WRIKE_CLIENT_ID}&response_type=code&state=${state}&redirect_uri=${WRIKE_REDIRECT_URL}`;

    const accountIdToUse = selectedCred?.accountId || accountId;
    if (accountIdToUse) {
      redirectUrl += `&accountId=${accountIdToUse}`;
    }

    res.send({ success: true, redirectUrl });
  });

  // View Handlers
  fastify.get("/", async (req, res) => {
    const { WRIKE_LOGIN_ENDPOINT, WRIKE_REDIRECT_URL } = process.env;

    const { accountId, redirectUri, autoRedirect, environment, environmentId } =
      req.query;

    if (!WRIKE_LOGIN_ENDPOINT) {
      throw new Error(
        "Missing WRIKE_LOGIN_ENDPOINT! Please contact your admin",
      );
    }

    // Get credentials from cached DB values (API type)
    const allCreds = getCachedWrikeCredentials();

    // Resolve environment: prioritize environmentId parameter, then environment parameter
    let selectedEnvironment = "";
    if (environmentId) {
      // Find environment by ID
      for (const [envName, envData] of Object.entries(allCreds || {})) {
        if (envData?.id == environmentId) {
          selectedEnvironment = envName;
          break;
        }
      }
    } else if (environment) {
      selectedEnvironment = environment;
    }

    const defaultEnvKey = Object.keys(allCreds)[0];
    const selectedCred = selectedEnvironment
      ? allCreds?.[selectedEnvironment]
      : allCreds[defaultEnvKey];
    const WRIKE_CLIENT_ID = selectedCred?.clientId;

    if (!WRIKE_CLIENT_ID) {
      return res.status(400).send({
        message: "Missing WRIKE_CLIENT_ID. Please contact your admin",
      });
    }

    if (autoRedirect == "true" || autoRedirect == "1") {
      let state = "";
      if (redirectUri) {
        state = fastify.jwt.sign({
          redirectUri,
          environmentId: selectedCred ? selectedCred?.id : "",
        });
      } else {
        state = fastify.jwt.sign({
          environmentId: selectedCred ? selectedCred?.id : "",
        });
      }

      let redirectUrl = `${WRIKE_LOGIN_ENDPOINT}/authorize/v4?client_id=${WRIKE_CLIENT_ID}&response_type=code&state=${state}&redirect_uri=${WRIKE_REDIRECT_URL}`;

      const accountIdToUse = selectedCred?.accountId || accountId;
      if (accountIdToUse) redirectUrl += `&accountId=${accountIdToUse}`;

      return res.redirect(redirectUrl);
    }

    let state = "";
    if (redirectUri) {
      state = fastify.jwt.sign({
        redirectUri,
        environmentId: selectedCred ? selectedCred?.id : "",
      });
    } else {
      state = fastify.jwt.sign({
        environmentId: selectedCred ? selectedCred?.id : "",
      });
    }

    let redirectUrl = `${WRIKE_LOGIN_ENDPOINT}/authorize/v4?client_id=${WRIKE_CLIENT_ID}&response_type=code&state=${state}&redirect_uri=${WRIKE_REDIRECT_URL}`;

    const accountIdToUse = selectedCred?.accountId || accountId;
    if (accountIdToUse) redirectUrl += `&accountId=${accountIdToUse}`;

    // Use visible credentials for dropdown (only admins can see hidden environments)
    const visibleCreds = getCachedVisibleWrikeCredentials();
    const environmentOptionsHtml = Object.keys(visibleCreds || {})
      .map(
        (env) =>
          `<option value="${env}"${env === selectedEnvironment ? " selected" : ""}>${env}</option>`,
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Wrike Token Service</title>
  <link rel="icon" href="https://cdn.wrike.com/static/branding/wrike/favicons/favicon.ico">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', sans-serif;
      height: 100vh;
      background: linear-gradient(-45deg, #1f1c2c, #928dab, #2e2e52, #515175);
      background-size: 400% 400%;
      animation: gradient 15s ease infinite;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }

    @keyframes gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .card {
      backdrop-filter: blur(16px);
      background-color: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 24px;
      padding: 50px 40px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.2);
      max-width: 400px;
      width: 90%;
      text-align: center;
      animation: fadeIn 1s ease-out forwards;
      opacity: 0;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .logo {
      width: 60px;
      height: 60px;
      background: #ffffff22;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
    }

    .logo span {
      font-size: 24px;
      font-weight: bold;
    }

    h1 {
      font-size: 1.8rem;
      margin-bottom: 12px;
    }

    p {
      font-size: 0.95rem;
      color: #cccccc;
      margin-bottom: 30px;
    }

    a.button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 26px;
      font-size: 1rem;
      font-weight: 600;
      color: white;
      background: #4CAF50;
      border: none;
      border-radius: 12px;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.3s ease, transform 0.2s ease;
      position: relative;
      min-width: 180px;
    }

    a.button:hover {
      background: #45a049;
      transform: translateY(-2px);
    }

    a.button svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .secondary-link {
      display: inline-block;
      font-size: 0.95rem;
      color: #dddddd;
      text-decoration: none;
      opacity: 0.8;
      transition: opacity 0.2s ease;
    }

    .secondary-link:hover {
      opacity: 1;
      text-decoration: underline;
    }

    .loader {
      border: 3px solid rgba(255,255,255,0.2);
      border-top: 3px solid white;
      border-radius: 50%;
      width: 18px;
      height: 18px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo"><span>W</span></div>
    <h1>Connect Your Wrike Account</h1>

    <style>
      .env-select-wrapper {
        width: 100%;
        margin-bottom: 16px;
        text-align: left;
      }
      .env-select-label {
        display: block;
        margin-bottom: 8px;
        color: #e2e8f0;
        font-size: 0.95rem;
        font-weight: 600;
      }
      .env-select {
        width: 100%;
        padding: 10px 12px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        background: rgba(255, 255, 255, 0.15);
        color: #e2e8f0;
        font-size: 0.95rem;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.17);
      }
      .env-select option {
        color: #0f172a;
        background: rgba(255,255,255,0.95);
      }
      .env-select:focus {
        border-color: #34d399;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
      }
    </style>

    <div class="env-select-wrapper">
      <label for="envSelect" class="env-select-label">Choose Environment</label>
      <select id="envSelect" class="env-select">
        ${environmentOptionsHtml}
      </select>
    </div>

    <p>To continue, please log in using your Wrike credentials.</p>
    <a href="${redirectUrl}" class="button" id="login-btn">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 17l5-5-5-5v10z"/></svg>
      <span>Login with Wrike</span>
    </a>

    <p style="margin-top: 30px; margin-bottom: 0px !important; font-size: 0.95rem; color: #dddddd;">
      Do you want to verify your token?
      <a href="${process.env.API_URL}/wrikexpi/token/evaluate" class="secondary-link" style="color: #9ae6b4; font-weight: 600; text-decoration: underline; margin-left: 4px;">
        Click here
      </a>
    </p>

    <p style="margin-top: 10px; margin-bottom: 0px !important; font-size: 0.95rem; color: #dddddd;">
      Want to see all your tokens?
      <a href="${process.env.API_URL}/wrikexpi/token/view" class="secondary-link" style="color: #9ae6b4; font-weight: 600; text-decoration: underline; margin-left: 4px;">
        View Tokens
      </a>
    </p>

  </div>

  <script>
    const loginBtn = document.getElementById("login-btn");
    const envSelect = document.getElementById("envSelect");
    const initialRedirectUrl = "${redirectUrl}";
    const initialRedirectUri = "${redirectUri || ""}";
    const initialAccountId = "${accountId || ""}";
    const initialEnvironment = "${selectedEnvironment}";
    const environmentsAvailable = ${Object.keys(visibleCreds || {}).length};

    // Handle environmentId query parameter (extract from URL for client-side lookup)
    function getEnvironmentIdFromUrl() {
      const params = new URLSearchParams(window.location.search);
      return params.get('environmentId');
    }

    const getRedirectUrl = async () => {
      const selectedEnv = envSelect?.value;
      
      try {
        const params = new URLSearchParams();
        if (selectedEnv) params.append("environment", selectedEnv);
        if (initialRedirectUri) params.append("redirectUri", initialRedirectUri);
        if (initialAccountId) params.append("accountId", initialAccountId);

        const response = await fetch("/get-redirect-url?" + params.toString());
        const data = await response.json();
        
        if (data.success && data.redirectUrl) {
          return data.redirectUrl;
        } else {
          console.error("Failed to get redirect URL:", data);
          return initialRedirectUrl;
        }
      } catch (err) {
        console.error("Error fetching redirect URL:", err);
        return initialRedirectUrl;
      }
    };

    // Reset button if coming back from redirect
    window.addEventListener("pageshow", () => {
      loginBtn.innerHTML = \`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M10 17l5-5-5-5v10z" />
        </svg>
        <span>Login with Wrike</span>
      \`;
      loginBtn.style.pointerEvents = "auto";
    });

    loginBtn.addEventListener("click", async function (e) {
      e.preventDefault();

      // Validation: Check if environments are configured
      if (environmentsAvailable === 0) {
        alert("No environments configured. Please contact your administrator to configure Wrike environments.");
        return;
      }

      // Validation: Check if an environment is selected
      if (envSelect && !envSelect.value) {
        alert("Please select an environment from the dropdown to proceed.");
        return;
      }
      
      // Show loader
      loginBtn.innerHTML = '<div class="loader"></div>';
      loginBtn.style.pointerEvents = "none";

      // Get redirect URL (with state, env, and accountId) and redirect after delay
      try {
        const redirectUrl = await getRedirectUrl();
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 600);
      } catch (err) {
        console.error("Error during redirect:", err);
        alert("An error occurred. Please try again.");
        loginBtn.innerHTML = \`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M10 17l5-5-5-5v10z" />
          </svg>
          <span>Login with Wrike</span>
        \`;
        loginBtn.style.pointerEvents = "auto";
      }
    });
  </script>
</body>
</html>
`;

    res.type("text/html").send(html);

    // res.send({ message: "WrikeXPI Token Service server is running..." });
  });

  // Run the server!
  fastify.listen(
    { port: process.env.PORT, host: "0.0.0.0" },
    function (err, address) {
      if (err) {
        fastify.log.error(err);
      }
      fastify.log.info(`Server listening on ${address}`);
    },
  );
})();
