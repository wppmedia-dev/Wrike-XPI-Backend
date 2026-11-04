import crypto from "crypto";
import { findRedirectionURL } from "../../utils/wrikeRedirect";
import { getCachedVisibleWrikeCredentials } from "../../utils/wrikeCredentials";
import { WrikeTokenExchange } from "../tokens/handlers/wrikeTokenExchange";
import { ResolveAuthFromJWT } from "../../middlewares/authentication";
import { clientIp } from "../../utils/environmentAccess";
import { TOKEN_TTL_SECONDS } from "../../utils/tokenTtl";
import { verifyFastifyJwt } from "../../utils/jwtSecrets";
import { OAuthClients } from "../../controllers";

const ACCESS_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS; // the JWE lifetime, one authority (src/utils/tokenTtl.js)
const AUTH_CODE_TTL = "60s";

const positiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Dynamic client registration hardening.
 *
 *   OAUTH_CLIENT_TTL_DAYS              lifetime of a newly registered
 *                                      client_id (default 365; was 10 years).
 *   OAUTH_REGISTER_RATE_LIMIT          registrations per IP per window
 *                                      (default 20).
 *   OAUTH_REGISTER_RATE_LIMIT_TIME     that window (default "1 hour").
 *   OAUTH_ACCEPT_LEGACY_CLIENTS        "false" rejects client_ids minted
 *                                      before registrations were stored (no
 *                                      jti, so they cannot be revoked one by
 *                                      one). Default: still accepted, so
 *                                      existing connectors keep working.
 */
const OAUTH_CLIENT_TTL_DAYS = positiveInt(process.env.OAUTH_CLIENT_TTL_DAYS, 365);
const REGISTER_RATE_LIMIT = {
  max: positiveInt(process.env.OAUTH_REGISTER_RATE_LIMIT, 20),
  timeWindow: process.env.OAUTH_REGISTER_RATE_LIMIT_TIME || "1 hour",
};
const acceptLegacyClients = () =>
  process.env.OAUTH_ACCEPT_LEGACY_CLIENTS !== "false";

// Bounds on an unauthenticated write.
const MAX_REDIRECT_URIS = 20;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 200;

const isExpiredError = (err) =>
  err?.code === "FAST_JWT_EXPIRED" || err?.name === "TokenExpiredError";

/**
 * Everything /authorize and /token need to know about a client_id.
 *
 *   absent            no client_id given
 *   invalid           not a client_id we signed — treated as an unregistered
 *                     client (loopback redirect only), exactly as before
 *   expired           a client_id we signed whose lifetime has passed
 *   revoked           an admin revoked this registration
 *   legacy_rejected   pre-registry client_id while legacy ones are disabled
 *   ok                usable; `claims` carries redirect_uris / client_name
 *
 * The revocation lookup fails OPEN on a database error (logged): signature
 * and expiry are still enforced, and an outage of the registry table must not
 * take every MCP sign-in down with it.
 */
const inspectClient = async (fastify, clientId) => {
  if (!clientId) return { state: "absent" };

  let claims;
  try {
    claims = verifyFastifyJwt(fastify, clientId);
  } catch (err) {
    return { state: isExpiredError(err) ? "expired" : "invalid" };
  }

  if (!claims?.jti) {
    return acceptLegacyClients()
      ? { state: "ok", claims }
      : { state: "legacy_rejected" };
  }

  try {
    if ((await OAuthClients.GetStatus(claims.jti)) === "revoked") {
      return { state: "revoked", claims };
    }
  } catch (err) {
    console.warn(
      new Date().toISOString(),
      `[oauth] client registry lookup failed, allowing signed client ${claims.jti}: ${err?.message || err}`,
    );
  }
  return { state: "ok", claims };
};

const CLIENT_REJECTION = {
  expired:
    "This client registration has expired. Register the client again (POST /oauth/register).",
  revoked: "This client registration has been revoked by an administrator.",
  legacy_rejected:
    "This client registration predates the client registry. Register the client again (POST /oauth/register).",
};

// The display name a client registered at /register, read back out of the
// signed client_id it was given. This is what labels the token that client ends
// up minting, and the only thing that distinguishes two tokens a user holds for
// the same environment in the admin console. A missing label must never be a
// reason to refuse a token, so anything unexpected yields null.
const clientNameFromClaims = (claims) => {
  const name = claims?.client_name;
  if (typeof name !== "string") return null;
  return name.trim().slice(0, 100) || null;
};

const isLoopback = (urlString) => {
  try {
    const { hostname } = new URL(urlString);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
};

const isHttps = (urlString) => {
  try {
    return new URL(urlString).protocol === "https:";
  } catch {
    return false;
  }
};


const renderEnvironmentPicker = ({ visibleCreds, query }) => {
  const hiddenFields = Object.entries(query)
    .filter(([key]) => key !== "environment_id" && key !== "environmentId")
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${key}" value="${String(value ?? "").replace(/"/g, "&quot;")}">`,
    )
    .join("\n");

  const options = Object.entries(visibleCreds || {})
    .map(
      ([envName, envData]) =>
        `<option value="${envData.id}">${envName}</option>`,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connect to WrikeXPI</title>
  <link rel="icon" href="https://cdn.wrike.com/static/branding/wrike/favicons/favicon.ico">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
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
      max-width: 400px;
      width: 90%;
      text-align: center;
    }
    h1 { font-size: 1.5rem; margin-bottom: 12px; }
    p { font-size: 0.9rem; color: #cccccc; margin-bottom: 24px; }
    .env-select-wrapper { width: 100%; margin-bottom: 20px; text-align: left; }
    .env-select-label { display: block; margin-bottom: 8px; color: #e2e8f0; font-size: 0.95rem; font-weight: 600; }
    .env-select {
      width: 100%;
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.35);
      background: rgba(255, 255, 255, 0.15);
      color: #e2e8f0;
      font-size: 0.95rem;
    }
    .env-select option { color: #0f172a; background: rgba(255,255,255,0.95); }
    button {
      width: 100%;
      padding: 14px 26px;
      font-size: 1rem;
      font-weight: 600;
      color: white;
      background: #4CAF50;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      position: relative;
      transition: background 0.15s;
    }
    button:hover:not(:disabled) { background: #45a049; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    /* Submitting this form leaves the page: the browser waits on the server,
       which then redirects to Wrike. That wait is long enough to be felt, and
       an unchanged button reads as a click that did nothing, so people click
       it again. Same treatment as the console's Sign In button: hide the
       label and draw a spinner over it, so the button keeps its size. */
    button.loading { color: transparent; pointer-events: none; }
    button.loading::after {
      content: "";
      position: absolute;
      width: 16px;
      height: 16px;
      top: 50%;
      left: 50%;
      margin: -8px 0 0 -8px;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.65s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect to Wrike Xtend</h1>
    <p>Choose which Wrike environment this connection should use.</p>
    <form method="GET" action="/oauth/authorize">
      ${hiddenFields}
      <div class="env-select-wrapper">
        <label for="envSelect" class="env-select-label">Choose Environment</label>
        <select id="envSelect" name="environment_id" class="env-select" required>
          <option value="" disabled selected>Select an environment</option>
          ${options}
        </select>
      </div>
      <button type="submit" id="continueBtn">Continue</button>
    </form>
  </div>
  <script>
    // Only runs once the form actually passes validation, so the spinner can
    // never get stuck on a form the browser refused to submit (the select is
    // required, and its own message is the feedback in that case).
    (function () {
      var form = document.querySelector("form");
      var button = document.getElementById("continueBtn");

      form.addEventListener("submit", function () {
        button.classList.add("loading");
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
      });

      // Coming back through the browser's cache restores the page as it was
      // left, spinner and all. Put the button back so it can be used again.
      window.addEventListener("pageshow", function (event) {
        if (!event.persisted) return;
        button.classList.remove("loading");
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
    })();
  </script>
</body>
</html>`;
};

export const oauthRoute = (fastify, opts, done) => {
  // MCP token requests are typically application/x-www-form-urlencoded; scope
  // a parser to this plugin only (no global body-parsing change).
  fastify.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (req, body, cb) => {
      try {
        cb(null, Object.fromEntries(new URLSearchParams(body)));
      } catch (err) {
        cb(err);
      }
    },
  );

  /**
   * Shared body for both /authorize routes below. `environmentId` is passed
   * in explicitly rather than read from req.query, so it can come from a URL
   * path segment (env-specific route) as well as the query string (generic
   * route) — see the two registrations right after this.
   */
  const handleAuthorize = async (req, reply, environmentId) => {
    try {
      const {
        response_type,
        client_id,
        redirect_uri,
        state,
        code_challenge,
        code_challenge_method,
        environment,
        accountId,
        scope,
      } = req.query;
      const environment_id = environmentId || req.query.environment_id;

      if (!redirect_uri) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: "redirect_uri is required",
        });
      }
      if (response_type && response_type !== "code") {
        return reply.code(400).send({ error: "unsupported_response_type" });
      }
      if (!code_challenge || code_challenge_method !== "S256") {
        return reply.code(400).send({
          error: "invalid_request",
          error_description:
            "PKCE (code_challenge + code_challenge_method=S256) is required",
        });
      }

      // client_id is a signed JWT minted by /oauth/register embedding
      // { redirect_uris }. Unverifiable/absent ones fall back to loopback-only.
      const client = await inspectClient(fastify, client_id);
      if (CLIENT_REJECTION[client.state]) {
        return reply.code(401).send({
          error: "invalid_client",
          error_description: CLIENT_REJECTION[client.state],
        });
      }
      const allowedRedirects =
        client.state === "ok" && Array.isArray(client.claims?.redirect_uris)
          ? client.claims.redirect_uris
          : null;
      if (allowedRedirects) {
        if (!allowedRedirects.includes(redirect_uri)) {
          return reply.code(400).send({
            error: "invalid_request",
            error_description:
              "redirect_uri is not registered for this client_id",
          });
        }
      } else if (!isLoopback(redirect_uri)) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description:
            "Unregistered clients must use a loopback (127.0.0.1/localhost) redirect_uri",
        });
      }

      const visibleCreds = getCachedVisibleWrikeCredentials();

      if (!environment_id) {
        return reply
          .type("text/html")
          .send(renderEnvironmentPicker({ visibleCreds, query: req.query }));
      }

      const knownEnv = Object.values(visibleCreds || {}).find(
        (c) => String(c.id) === String(environment_id),
      );
      if (!knownEnv) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: `Unknown environment_id: ${environment_id}`,
        });
      }

      const { redirectUrl } = findRedirectionURL(
        {
          environmentId: environment_id,
          environment,
          redirectUri: redirect_uri,
          accountId,
          // The standard OAuth `scope` the MCP client asked for, handed to
          // Wrike so the Wrike token is created with only those scopes.
          scope,
          extra: {
            code_challenge,
            code_challenge_method,
            client_state: state,
            client_id: client_id || null,
          },
        },
        fastify,
      );

      return reply.redirect(redirectUrl);
    } catch (err) {
      return reply.code(400).send({
        error: "server_error",
        error_description: err?.message || "Failed to start authorization",
      });
    }
  };

  // Generic route: environment_id (if any) comes from the query string,
  // same as every other OAuth param. This is what a client reaches when it
  // omits environment_id entirely (the picker) or merges it correctly.
  fastify.get("/authorize", async (req, reply) => {
    return handleAuthorize(req, reply, null);
  });

  // Env-specific route: environment_id comes from the URL path instead of
  // the query string, so it can never collide with a client's own OAuth
  // params — a client that naively appends "?response_type=...&client_id=..."
  // to whatever authorization_endpoint it was given (rather than parsing and
  // merging query strings) cannot corrupt this the way it could corrupt
  // "/authorize?environment_id=...". This is what /.well-known/oauth-authorization-server/env/:environmentId
  // now advertises as authorization_endpoint (see ./wellKnown.js).
  fastify.get("/authorize/env/:environmentId", async (req, reply) => {
    return handleAuthorize(req, reply, req.params.environmentId);
  });

  fastify.post("/token", async (req, reply) => {
    try {
      const body = req.body || {};
      const { grant_type } = body;

      if (grant_type === "authorization_code") {
        const { code, code_verifier, redirect_uri } = body;
        if (!code || !code_verifier) {
          return reply.code(400).send({ error: "invalid_request" });
        }

        let decoded;
        try {
          decoded = verifyFastifyJwt(fastify, code);
        } catch {
          return reply.code(400).send({
            error: "invalid_grant",
            error_description: "Authorization code is invalid or expired",
          });
        }

        if (
          redirect_uri &&
          decoded.redirect_uri &&
          redirect_uri !== decoded.redirect_uri
        ) {
          return reply.code(400).send({
            error: "invalid_grant",
            error_description:
              "redirect_uri does not match the one used at /authorize",
          });
        }

        const computedChallenge = crypto
          .createHash("sha256")
          .update(code_verifier)
          .digest("base64url");
        if (computedChallenge !== decoded.code_challenge) {
          return reply.code(400).send({
            error: "invalid_grant",
            error_description: "PKCE verification failed",
          });
        }

        // Re-check the client: a registration revoked between /authorize
        // and here must not complete the exchange.
        const client = await inspectClient(fastify, decoded.client_id);
        if (CLIENT_REJECTION[client.state]) {
          return reply.code(400).send({
            error: "invalid_grant",
            error_description: CLIENT_REJECTION[client.state],
          });
        }

        const result = await WrikeTokenExchange(
          {
            code: decoded.wrikeCode,
            environmentId: decoded.environmentId,
            ip: clientIp(req),
            // What to call the token this mints in the admin console. The
            // registered client name where there is one, otherwise a generic
            // label that is at least honest: reaching this line means something
            // completed a PKCE flow, so it is an MCP client.
            clientName:
              (client.state === "ok" && clientNameFromClaims(client.claims)) ||
              "MCP client",
          },
          fastify,
        );

        if (client.claims?.jti) OAuthClients.TouchLastUsed(client.claims.jti);

        return reply.code(200).send({
          access_token: result.token,
          token_type: "Bearer",
          expires_in: ACCESS_TOKEN_TTL_SECONDS,
        });
      }

      if (grant_type === "refresh_token") {
        const { refresh_token } = body;
        if (!refresh_token) {
          return reply.code(400).send({ error: "invalid_request" });
        }
        try {
          // Re-validates (and, if near expiry, transparently refreshes the
          // underlying Wrike token server-side). See authentication.js
          // resolveAuth().
          await ResolveAuthFromJWT(refresh_token);
        } catch {
          return reply.code(400).send({ error: "invalid_grant" });
        }

        // The JWE is its own refresh handle: it already self-refreshes the
        // underlying Wrike access token server-side, so no separate refresh
        // token needs to be minted. It is echoed back with a fresh TTL.
        return reply.code(200).send({
          access_token: refresh_token,
          token_type: "Bearer",
          expires_in: ACCESS_TOKEN_TTL_SECONDS,
        });
      }

      return reply.code(400).send({ error: "unsupported_grant_type" });
    } catch (err) {
      if (err?.statusCode === 403) {
        // Environment allow list rejected this caller (see
        // WrikeTokenExchange -> evaluateAccess): a real OAuth2 error code,
        // not a malformed/expired grant.
        return reply.code(403).send({
          error: "access_denied",
          error_description:
            err?.message || "Access denied for this environment",
        });
      }
      return reply.code(400).send({
        error: "invalid_grant",
        error_description: err?.message || "Token exchange failed",
      });
    }
  });

  // Unauthenticated by nature (RFC 7591 open registration), so it is
  // rate-limited per IP, bounded in size, and every registration is stored
  // so an admin can see and revoke it (/api/v1/admin/oauth-clients).
  fastify.post(
    "/register",
    { config: { rateLimit: REGISTER_RATE_LIMIT } },
    async (req, reply) => {
      const { redirect_uris, client_name } = req.body || {};

      if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return reply.code(400).send({
          error: "invalid_client_metadata",
          error_description:
            "redirect_uris is required and must be a non-empty array",
        });
      }

      if (redirect_uris.length > MAX_REDIRECT_URIS) {
        return reply.code(400).send({
          error: "invalid_client_metadata",
          error_description: `At most ${MAX_REDIRECT_URIS} redirect_uris may be registered`,
        });
      }

      for (const uri of redirect_uris) {
        if (typeof uri !== "string" || uri.length > MAX_REDIRECT_URI_LENGTH) {
          return reply.code(400).send({
            error: "invalid_redirect_uri",
            error_description: `redirect_uri must be a string of at most ${MAX_REDIRECT_URI_LENGTH} characters`,
          });
        }
        if (!isLoopback(uri) && !isHttps(uri)) {
          return reply.code(400).send({
            error: "invalid_redirect_uri",
            error_description: `redirect_uri must be loopback (127.0.0.1/localhost) or https: ${uri}`,
          });
        }
      }

      const name =
        typeof client_name === "string" && client_name.trim()
          ? client_name.trim().slice(0, MAX_CLIENT_NAME_LENGTH)
          : null;

      const id = crypto.randomUUID();
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = new Date(
        (issuedAt + OAUTH_CLIENT_TTL_DAYS * 24 * 60 * 60) * 1000,
      );

      // Stored so it can be listed and revoked. If the write fails the
      // registration still succeeds (logged): the client_id is signed and
      // expires on its own, and a registry outage must not block every new
      // MCP connector. Such a client simply cannot be revoked individually.
      try {
        await OAuthClients.Register({
          id,
          client_name: name,
          redirect_uris,
          expires_at: expiresAt,
          created_ip: clientIp(req),
          user_agent: req.headers["user-agent"],
        });
      } catch (err) {
        console.error(
          new Date().toISOString(),
          `[oauth] failed to store client registration ${id}: ${err?.message || err}`,
        );
      }

      // client_id is a signed JWT embedding the registered redirect_uris
      // (verified at /authorize and /token without a lookup); `jti` links it
      // to the stored row for revocation.
      const client_id = fastify.jwt.sign(
        { jti: id, redirect_uris, client_name: name },
        { expiresIn: `${OAUTH_CLIENT_TTL_DAYS}d` },
      );

      return reply.code(201).send({
        client_id,
        client_id_issued_at: issuedAt,
        redirect_uris,
        client_name: name || undefined,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      });
    },
  );

  done();
};

export default oauthRoute;
